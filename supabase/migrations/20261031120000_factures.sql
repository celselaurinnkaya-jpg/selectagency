-- SELECT Agency — Factures, et identité visuelle des factures (logo, cachet, signature).
--
-- Une facture est adressée à un client (elle peut citer l'un de ses dossiers), dans la devise choisie.
-- Elle est numérotée dès sa création (FAC-AAAA-00001) et le numéro d'une facture supprimée n'est
-- jamais réutilisé. Un brouillon ou une facture émise se modifie et se supprime ; une facture payée
-- est verrouillée (on la remet « à payer » pour la corriger). Les montants sont recalculés par la
-- base : ligne = quantité × prix unitaire ; taxe = ligne × taux, arrondie à l'unité mineure ;
-- total = lignes + taxes − remise.
-- La facture est un document remis au client : elle ne crée ni prestation ni paiement (les
-- encaissements restent dans « Paiements et reçus »). Les écritures passent par des fonctions.
--
-- Identité visuelle : un logo, un cachet et une signature par agence, dans un bucket privé
-- (« branding »), chemin {agence}/{type}-{horodatage}.{ext}. Lisibles par les rôles qui voient la
-- finance, remplacés uniquement par le propriétaire et les administrateurs.

-- Réglages des factures -----------------------------------------------------------------------------

create table public.invoice_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  legal_name text not null default '' check (char_length(legal_name) <= 160),
  address text not null default '' check (char_length(address) <= 250),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 254),
  tax_id text not null default '' check (char_length(tax_id) <= 160),
  signatory_name text not null default '' check (char_length(signatory_name) <= 120),
  payment_details text not null default '' check (char_length(payment_details) <= 500),
  footer_note text not null default '' check (char_length(footer_note) <= 500),
  logo_path text check (logo_path is null or split_part(logo_path, '/', 1) = organization_id::text),
  stamp_path text check (stamp_path is null or split_part(stamp_path, '/', 1) = organization_id::text),
  signature_path text check (signature_path is null or split_part(signature_path, '/', 1) = organization_id::text),
  updated_at timestamptz not null default now()
);

create trigger invoice_settings_touch before update on public.invoice_settings
for each row execute function private.touch_updated_at();

alter table public.invoice_settings enable row level security;
revoke all on public.invoice_settings from anon;
revoke insert, update, delete on public.invoice_settings from authenticated;
grant select on public.invoice_settings to authenticated;

create policy invoice_settings_select on public.invoice_settings for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Coordonnées imprimées sur les factures. p_settings : { legal_name, address, phone, email, tax_id,
-- signatory_name, payment_details, footer_note } (une clé absente vaut vide).
create function public.save_invoice_settings(p_organization_id uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les réglages des factures.';
  end if;
  insert into public.invoice_settings as s (
    organization_id, legal_name, address, phone, email, tax_id, signatory_name, payment_details, footer_note
  ) values (
    p_organization_id,
    trim(coalesce(p_settings ->> 'legal_name', '')),
    trim(coalesce(p_settings ->> 'address', '')),
    trim(coalesce(p_settings ->> 'phone', '')),
    trim(coalesce(p_settings ->> 'email', '')),
    trim(coalesce(p_settings ->> 'tax_id', '')),
    trim(coalesce(p_settings ->> 'signatory_name', '')),
    trim(coalesce(p_settings ->> 'payment_details', '')),
    trim(coalesce(p_settings ->> 'footer_note', ''))
  )
  on conflict (organization_id) do update set
    legal_name = excluded.legal_name,
    address = excluded.address,
    phone = excluded.phone,
    email = excluded.email,
    tax_id = excluded.tax_id,
    signatory_name = excluded.signatory_name,
    payment_details = excluded.payment_details,
    footer_note = excluded.footer_note;
end;
$$;

-- Images des factures ---------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Le premier dossier du chemin est l'agence (comparé en texte : un chemin mal formé est refusé, sans
-- erreur). Écrire demande en plus un abonnement qui permet d'écrire.
create function private.branding_path_allowed(p_name text, p_write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.user_id = (select auth.uid())
      and m.organization_id::text = split_part(p_name, '/', 1)
      and m.role = any (case when p_write then array['owner', 'admin'] else array['owner', 'admin', 'agent', 'accountant'] end)
      and (not p_write or private.org_can_write(m.organization_id))
  );
$$;

revoke all on function private.branding_path_allowed(text, boolean) from public;
grant execute on function private.branding_path_allowed(text, boolean) to authenticated;

create policy select_agency_branding_select on storage.objects for select to authenticated
  using (bucket_id = 'branding' and private.branding_path_allowed(name, false));

create policy select_agency_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and private.branding_path_allowed(name, true));

create policy select_agency_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and private.branding_path_allowed(name, true));

-- Remplace (ou retire, avec p_path vide) le logo, le cachet ou la signature. Le fichier doit déjà être
-- déposé dans le dossier de l'agence. Renvoie le chemin de l'ancienne image, à effacer du stockage.
create function public.set_invoice_image(p_organization_id uuid, p_kind text, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
  v_path text := nullif(trim(coalesce(p_path, '')), '');
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier le logo, le cachet et la signature.';
  end if;
  if p_kind not in ('logo', 'stamp', 'signature') then
    raise exception 'Image inconnue.';
  end if;
  if v_path is not null and (
    split_part(v_path, '/', 1) <> p_organization_id::text
    or split_part(v_path, '/', 2) not like p_kind || '-%'
    or not exists (select 1 from storage.objects o where o.bucket_id = 'branding' and o.name = v_path)
  ) then
    raise exception 'L''image n''a pas été reçue. Envoyez-la de nouveau.';
  end if;

  insert into public.invoice_settings (organization_id) values (p_organization_id) on conflict (organization_id) do nothing;
  select case p_kind when 'logo' then s.logo_path when 'stamp' then s.stamp_path else s.signature_path end
  into v_old
  from public.invoice_settings s where s.organization_id = p_organization_id for update;

  update public.invoice_settings s set
    logo_path = case when p_kind = 'logo' then v_path else s.logo_path end,
    stamp_path = case when p_kind = 'stamp' then v_path else s.stamp_path end,
    signature_path = case when p_kind = 'signature' then v_path else s.signature_path end
  where s.organization_id = p_organization_id;

  return nullif(v_old, coalesce(v_path, ''));
end;
$$;

-- Factures ------------------------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  client_id uuid not null,
  case_id uuid,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  issue_date date not null,
  due_date date not null,
  discount_label text check (char_length(discount_label) <= 80),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  subtotal_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  total_minor bigint not null default 0 check (total_minor >= 0),
  payment_details text check (char_length(payment_details) <= 500),
  notes text check (char_length(notes) <= 1000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  check (due_date >= issue_date),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, case_id) references public.cases (organization_id, id),
  foreign key (organization_id, created_by) references public.members (organization_id, id)
);

create index invoices_client_idx on public.invoices (organization_id, client_id);
create index invoices_case_idx on public.invoices (organization_id, case_id);
create index invoices_created_by_idx on public.invoices (organization_id, created_by);
create index invoices_issue_date_idx on public.invoices (organization_id, issue_date desc);

create trigger invoices_touch before update on public.invoices
for each row execute function private.touch_updated_at();

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  position integer not null check (position > 0),
  label text not null check (char_length(label) between 2 and 160),
  quantity integer not null default 1 check (quantity between 1 and 9999),
  unit_amount_minor bigint not null check (unit_amount_minor > 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  unique (invoice_id, position),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade
);

create index invoice_items_invoice_idx on public.invoice_items (organization_id, invoice_id);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoices, public.invoice_items from anon;
revoke insert, update, delete on public.invoices, public.invoice_items from authenticated;
grant select on public.invoices, public.invoice_items to authenticated;

-- Comme la finance : pas pour la lecture seule.
create policy invoices_select on public.invoices for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));
create policy invoice_items_select on public.invoice_items for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

create function private.assign_invoice_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.importing() then
    new.number := private.formatted_number(new.organization_id, 'invoice', 'FAC');
  end if;
  return new;
end;
$$;

create trigger invoices_number before insert on public.invoices
for each row execute function private.assign_invoice_number();

-- Crée (p_invoice_id vide) ou modifie une facture et remplace ses lignes. p_issue émet un brouillon ;
-- une facture déjà émise le reste. p_items : [{ label, quantity, unit_amount_minor, tax_rate }].
create function public.save_invoice(
  p_invoice_id uuid,
  p_client_id uuid,
  p_case_id uuid,
  p_currency text,
  p_issue_date date,
  p_due_date date,
  p_discount_label text,
  p_discount_minor bigint,
  p_payment_details text,
  p_notes text,
  p_issue boolean,
  p_items jsonb,
  p_event text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_roles constant text[] := array['owner', 'admin', 'agent', 'accountant'];
  v_client public.clients;
  v_invoice public.invoices;
  v_item jsonb;
  v_subtotal bigint;
  v_tax bigint;
  v_discount bigint := coalesce(p_discount_minor, 0);
begin
  if p_invoice_id is not null then
    select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
    if not found or not private.has_role(v_invoice.organization_id, v_roles) then
      raise exception 'Facture introuvable, ou vous n''avez pas le droit de la modifier.';
    end if;
    if v_invoice.status not in ('draft', 'issued') then
      raise exception 'Une facture payée ou annulée ne se modifie plus.';
    end if;
  end if;

  select * into v_client from public.clients c where c.id = p_client_id;
  if not found
    or not private.has_role(v_client.organization_id, v_roles)
    or (p_invoice_id is not null and v_client.organization_id <> v_invoice.organization_id) then
    raise exception 'Client introuvable, ou vous n''avez pas le droit de lui établir une facture.';
  end if;
  if p_case_id is not null and not exists (
    select 1 from public.cases c where c.id = p_case_id and c.organization_id = v_client.organization_id and c.client_id = v_client.id
  ) then
    raise exception 'Ce dossier n''appartient pas à ce client.';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide.';
  end if;
  if p_issue_date is null or p_due_date is null then
    raise exception 'Indiquez la date d''émission et la date d''échéance.';
  end if;
  if p_due_date < p_issue_date then
    raise exception 'La date d''échéance ne peut pas précéder la date d''émission.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Ajoutez au moins une ligne à la facture.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Une facture compte au plus 50 lignes.';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if char_length(trim(coalesce(v_item ->> 'label', ''))) not between 2 and 160 then
      raise exception 'Chaque ligne doit être décrite (de 2 à 160 caractères).';
    end if;
    if coalesce((v_item ->> 'quantity')::integer, 0) not between 1 and 9999
      or coalesce((v_item ->> 'unit_amount_minor')::bigint, 0) <= 0
      or coalesce((v_item ->> 'tax_rate')::numeric, 0) not between 0 and 100 then
      raise exception 'La ligne « % » a une quantité, un prix ou une taxe invalide.', trim(v_item ->> 'label');
    end if;
  end loop;
  if v_discount < 0 then
    raise exception 'La remise ne peut pas être négative.';
  end if;

  if p_invoice_id is null then
    insert into public.invoices (
      organization_id, client_id, case_id, status, currency, issue_date, due_date, discount_label, discount_minor,
      payment_details, notes, created_by, issued_at
    ) values (
      v_client.organization_id, v_client.id, p_case_id, case when p_issue then 'issued' else 'draft' end, p_currency,
      p_issue_date, p_due_date, case when v_discount > 0 then nullif(trim(coalesce(p_discount_label, '')), '') end, v_discount,
      nullif(trim(coalesce(p_payment_details, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
      private.member_id(v_client.organization_id), case when p_issue then now() end
    ) returning * into v_invoice;
  else
    update public.invoices i set
      client_id = v_client.id,
      case_id = p_case_id,
      currency = p_currency,
      issue_date = p_issue_date,
      due_date = p_due_date,
      discount_label = case when v_discount > 0 then nullif(trim(coalesce(p_discount_label, '')), '') end,
      discount_minor = v_discount,
      payment_details = nullif(trim(coalesce(p_payment_details, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      status = case when p_issue and i.status = 'draft' then 'issued' else i.status end,
      issued_at = case when p_issue and i.status = 'draft' then now() else i.issued_at end
    where i.id = v_invoice.id
    returning * into v_invoice;
    delete from public.invoice_items ii where ii.invoice_id = v_invoice.id;
  end if;

  insert into public.invoice_items (organization_id, invoice_id, position, label, quantity, unit_amount_minor, tax_rate)
  select v_invoice.organization_id, v_invoice.id, i.position::integer, trim(i.item ->> 'label'), (i.item ->> 'quantity')::integer,
    (i.item ->> 'unit_amount_minor')::bigint, coalesce((i.item ->> 'tax_rate')::numeric, 0)
  from jsonb_array_elements(p_items) with ordinality as i(item, position);

  select coalesce(sum(ii.quantity * ii.unit_amount_minor), 0), coalesce(sum(round(ii.quantity * ii.unit_amount_minor * ii.tax_rate / 100)), 0)
  into v_subtotal, v_tax
  from public.invoice_items ii where ii.invoice_id = v_invoice.id;
  if v_discount > v_subtotal + v_tax then
    raise exception 'La remise ne peut pas dépasser le total de la facture.';
  end if;

  update public.invoices i set subtotal_minor = v_subtotal, tax_minor = v_tax, total_minor = v_subtotal + v_tax - v_discount
  where i.id = v_invoice.id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_client.id, p_case_id, replace(p_event, '{facture}', v_invoice.number));

  return jsonb_build_object('id', v_invoice.id, 'number', v_invoice.number, 'status', v_invoice.status);
end;
$$;

-- Étapes d'une facture : brouillon → émise → payée ; annulation tant qu'elle n'est pas payée ; une
-- facture payée peut être remise « à payer » (paiement annulé, erreur de saisie).
create function public.set_invoice_status(p_invoice_id uuid, p_status text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found or not private.has_role(v_invoice.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Facture introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if not (
    (v_invoice.status = 'draft' and p_status in ('issued', 'cancelled'))
    or (v_invoice.status = 'issued' and p_status in ('paid', 'cancelled'))
    or (v_invoice.status = 'paid' and p_status = 'issued')
  ) then
    raise exception 'Cette facture ne peut pas passer à cet état.';
  end if;

  update public.invoices i set
    status = p_status,
    issued_at = case when p_status = 'issued' then coalesce(i.issued_at, now()) else i.issued_at end,
    paid_at = case when p_status = 'paid' then now() when p_status = 'issued' then null else i.paid_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else i.cancelled_at end
  where i.id = v_invoice.id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_invoice.client_id, v_invoice.case_id, replace(p_event, '{facture}', v_invoice.number));
end;
$$;

-- Suppression : propriétaire, administrateur ou comptable ; jamais une facture payée. L'historique
-- garde la trace de la facture supprimée, et son numéro n'est pas réutilisé.
create function public.delete_invoice(p_invoice_id uuid, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found or not private.has_role(v_invoice.organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'Facture introuvable, ou vous n''avez pas le droit de la supprimer.';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Une facture payée ne se supprime pas : remettez-la d''abord « à payer ».';
  end if;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_invoice.client_id, v_invoice.case_id, replace(p_event, '{facture}', v_invoice.number));
  delete from public.invoices i where i.id = v_invoice.id;
end;
$$;

revoke all on function private.assign_invoice_number() from public, anon, authenticated;

revoke all on function
  public.save_invoice_settings(uuid, jsonb),
  public.set_invoice_image(uuid, text, text),
  public.save_invoice(uuid, uuid, uuid, text, date, date, text, bigint, text, text, boolean, jsonb, text),
  public.set_invoice_status(uuid, text, text),
  public.delete_invoice(uuid, text)
from public, anon;

grant execute on function
  public.save_invoice_settings(uuid, jsonb),
  public.set_invoice_image(uuid, text, text),
  public.save_invoice(uuid, uuid, uuid, text, date, date, text, bigint, text, text, boolean, jsonb, text),
  public.set_invoice_status(uuid, text, text),
  public.delete_invoice(uuid, text)
to authenticated;
