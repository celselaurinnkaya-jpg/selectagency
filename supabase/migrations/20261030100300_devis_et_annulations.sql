-- SELECT Agency — Devis et annulation des paiements.
--
-- Devis : proposition chiffrée rattachée à un dossier, dans sa devise. À l'acceptation, chaque
-- ligne devient une prestation convenue (charges), sur laquelle les paiements sont ensuite affectés.
-- « Envoyé » signifie que l'agence a remis le devis au client elle-même (imprimé, PDF, WhatsApp) :
-- l'application n'envoie rien. Les écritures passent par des fonctions (aucune politique d'écriture).
--
-- Annulation d'un paiement : le reçu n'est jamais supprimé ni renuméroté ; il est marqué « annulé »
-- avec son motif, et le montant cesse de compter dans les soldes (record_payment ne compte que les
-- paiements « recorded »). Réservé au propriétaire, à l'administrateur et au comptable.

-- Devis ---------------------------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null,
  case_id uuid not null,
  client_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'refused', 'cancelled')),
  valid_until date,
  notes text check (char_length(notes) <= 1000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, reference),
  foreign key (organization_id, case_id) references public.cases (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, created_by) references public.members (organization_id, id)
);

create index quotes_case_idx on public.quotes (organization_id, case_id);
create index quotes_client_idx on public.quotes (organization_id, client_id);
create index quotes_created_by_idx on public.quotes (organization_id, created_by);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null,
  position integer not null check (position > 0),
  label text not null check (char_length(label) between 2 and 160),
  charge_type text not null check (charge_type in ('agency_fee', 'third_party')),
  quantity integer not null default 1 check (quantity between 1 and 999),
  unit_amount_minor bigint not null check (unit_amount_minor > 0),
  -- Prestation créée à l'acceptation du devis.
  charge_id uuid,
  unique (quote_id, position),
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, charge_id) references public.charges (organization_id, id)
);

create index quote_items_quote_idx on public.quote_items (organization_id, quote_id);
create index quote_items_charge_idx on public.quote_items (organization_id, charge_id);

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

revoke all on public.quotes, public.quote_items from anon;
revoke insert, update, delete on public.quotes, public.quote_items from authenticated;
grant select on public.quotes, public.quote_items to authenticated;

-- Comme la finance : pas pour la lecture seule.
create policy quotes_select on public.quotes for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));
create policy quote_items_select on public.quote_items for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

create function private.assign_quote_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.importing() then
    new.reference := private.formatted_number(new.organization_id, 'quote', 'DEV');
  end if;
  return new;
end;
$$;

create trigger quotes_reference before insert on public.quotes
for each row execute function private.assign_quote_reference();

-- Crée un devis et ses lignes. p_items : [{ label, charge_type, quantity, unit_amount_minor }].
create function public.create_quote(p_case_id uuid, p_valid_until date, p_notes text, p_items jsonb, p_event text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_quote public.quotes;
begin
  select * into v_case from public.cases c where c.id = p_case_id;
  if not found or not private.has_role(v_case.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit d''y préparer un devis.';
  end if;
  if v_case.status in ('cancelled', 'closed') then
    raise exception 'Ce dossier est clôturé ou annulé : il n''accepte plus de devis.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Ajoutez au moins une ligne au devis.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Un devis compte au plus 50 lignes.';
  end if;

  insert into public.quotes (organization_id, case_id, client_id, currency, valid_until, notes, created_by)
  values (
    v_case.organization_id, v_case.id, v_case.client_id, v_case.billing_currency, p_valid_until,
    nullif(trim(coalesce(p_notes, '')), ''), private.member_id(v_case.organization_id)
  ) returning * into v_quote;

  insert into public.quote_items (organization_id, quote_id, position, label, charge_type, quantity, unit_amount_minor)
  select v_case.organization_id, v_quote.id, i.position::integer, trim(i.item ->> 'label'), i.item ->> 'charge_type',
    coalesce((i.item ->> 'quantity')::integer, 1), (i.item ->> 'unit_amount_minor')::bigint
  from jsonb_array_elements(p_items) with ordinality as i(item, position);

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id, replace(p_event, '{devis}', v_quote.reference));

  return jsonb_build_object('id', v_quote.id, 'reference', v_quote.reference);
end;
$$;

-- Fait avancer un devis : brouillon → envoyé → accepté ou refusé ; annulation tant qu'il n'est pas
-- accepté. À l'acceptation, les lignes deviennent des prestations du dossier.
create function public.set_quote_status(p_quote_id uuid, p_status text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes;
  v_case public.cases;
  v_item public.quote_items;
  v_charge uuid;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id for update;
  if not found or not private.has_role(v_quote.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Devis introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  if not (
    (v_quote.status = 'draft' and p_status in ('sent', 'accepted', 'cancelled'))
    or (v_quote.status = 'sent' and p_status in ('accepted', 'refused', 'cancelled'))
  ) then
    raise exception 'Ce devis ne peut plus passer à cet état.';
  end if;

  if p_status = 'accepted' then
    select * into v_case from public.cases c where c.id = v_quote.case_id for update;
    if v_case.status in ('cancelled', 'closed') then
      raise exception 'Le dossier est clôturé ou annulé : rouvrez-le avant d''accepter le devis.';
    end if;
    for v_item in select * from public.quote_items qi where qi.quote_id = v_quote.id order by qi.position loop
      insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency)
      values (
        v_quote.organization_id, v_quote.case_id,
        left(case when v_item.quantity > 1 then v_item.label || ' (× ' || v_item.quantity || ')' else v_item.label end, 160),
        v_item.charge_type, v_item.quantity * v_item.unit_amount_minor, v_quote.currency
      ) returning id into v_charge;
      update public.quote_items qi set charge_id = v_charge where qi.id = v_item.id;
    end loop;
  end if;

  update public.quotes q set
    status = p_status,
    sent_at = case when p_status = 'sent' then now() else q.sent_at end,
    decided_at = case when p_status in ('accepted', 'refused', 'cancelled') then now() else q.decided_at end
  where q.id = v_quote.id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_quote.organization_id, private.member_id(v_quote.organization_id), v_quote.client_id, v_quote.case_id, replace(p_event, '{devis}', v_quote.reference));
end;
$$;

-- Annulation d'un paiement --------------------------------------------------------------------------

alter table public.payments
  add column voided_at timestamptz,
  add column voided_by uuid,
  add column void_reason text check (char_length(void_reason) <= 300),
  add foreign key (organization_id, voided_by) references public.members (organization_id, id);

create index payments_voided_by_idx on public.payments (organization_id, voided_by);

create function public.void_payment(p_payment_id uuid, p_reason text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id for update;
  if not found or not private.has_role(v_payment.organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'Paiement introuvable, ou vous n''avez pas le droit de l''annuler.';
  end if;
  if v_payment.status = 'voided' then
    raise exception 'Ce paiement est déjà annulé.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;

  update public.payments p set
    status = 'voided', voided_at = now(), voided_by = private.member_id(v_payment.organization_id), void_reason = left(trim(p_reason), 300)
  where p.id = v_payment.id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_payment.organization_id, private.member_id(v_payment.organization_id), v_payment.client_id, v_payment.case_id, p_event);
end;
$$;

revoke all on function private.assign_quote_reference() from public, anon, authenticated;

revoke all on function
  public.create_quote(uuid, date, text, jsonb, text),
  public.set_quote_status(uuid, text, text),
  public.void_payment(uuid, text, text)
from public, anon;

grant execute on function
  public.create_quote(uuid, date, text, jsonb, text),
  public.set_quote_status(uuid, text, text),
  public.void_payment(uuid, text, text)
to authenticated;
