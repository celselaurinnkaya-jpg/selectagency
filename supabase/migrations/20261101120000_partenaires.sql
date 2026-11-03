-- SELECT Agency — Partenaires, codes de recommandation et commissions.
--
-- Un partenaire (ancien client, lycée, correspondant…) a un code que l'agence note sur la fiche des
-- clients qu'il apporte. Chaque client apporté donne une commission, d'un montant fixé par l'agence
-- pour ce partenaire (ajustable au cas par cas) : « en attente » tant que le client n'a rien payé,
-- « à payer » dès son premier paiement confirmé, puis « payée » (date, moyen, référence) ou annulée.
-- Un client n'a qu'un partenaire et qu'une commission : pas de double comptage.
--
-- Espace partenaire : le partenaire n'est jamais membre de l'agence (aucune politique de lecture ne
-- lui ouvre les tables). Il voit seulement ce que renvoie partner_portal() : prénom et initiale de ses
-- clients, un avancement simple et ses commissions — ni téléphone, ni documents, ni paiements.

-- Partenaires ---------------------------------------------------------------------------------------

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  code text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  phone text check (char_length(phone) <= 40),
  email text check (email = lower(email) and char_length(email) <= 254),
  commission_minor bigint not null default 0 check (commission_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  notes text not null default '' check (char_length(notes) <= 1000),
  is_active boolean not null default true,
  -- Accès à l'espace partenaire : lien personnel (jeton) lié à une adresse, puis compte rattaché.
  user_id uuid references auth.users (id) on delete set null,
  access_token uuid unique,
  access_email text check (access_email = lower(access_email)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create unique index partners_name_idx on public.partners (organization_id, lower(name));
create index partners_user_idx on public.partners (user_id);
create trigger partners_touch before update on public.partners for each row execute function private.touch_updated_at();

alter table public.clients add column partner_id uuid;
alter table public.clients add foreign key (organization_id, partner_id) references public.partners (organization_id, id) on delete set null (partner_id);
create index clients_partner_idx on public.clients (organization_id, partner_id);

-- Commissions -----------------------------------------------------------------------------------------

create table public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  partner_id uuid not null,
  client_id uuid not null unique,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'cancelled')),
  approved_at timestamptz,
  paid_at timestamptz,
  paid_method text check (char_length(paid_method) <= 60),
  paid_reference text check (char_length(paid_reference) <= 80),
  paid_by uuid,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'paid' or (paid_at is not null and paid_by is not null)),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, paid_by) references public.members (organization_id, id)
);

create index partner_commissions_partner_idx on public.partner_commissions (organization_id, partner_id);
create index partner_commissions_paid_by_idx on public.partner_commissions (organization_id, paid_by);
create trigger partner_commissions_touch before update on public.partner_commissions for each row execute function private.touch_updated_at();

alter table public.partners enable row level security;
alter table public.partner_commissions enable row level security;
revoke all on public.partners, public.partner_commissions from anon;
revoke insert, update, delete on public.partners, public.partner_commissions from authenticated;
grant select on public.partners, public.partner_commissions to authenticated;

-- Partenaires : tous les membres (pour reconnaître un code). Commissions : rôles qui voient la finance.
create policy partners_select on public.partners for select to authenticated
  using (organization_id in (select private.my_org_ids()));
create policy partner_commissions_select on public.partner_commissions for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Le client a-t-il au moins un paiement confirmé ?
create function private.client_has_paid(p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payments p where p.client_id = p_client_id and p.status = 'recorded');
$$;

-- Premier paiement confirmé : la commission devient « à payer ». Plus aucun paiement confirmé
-- (annulation) : elle redevient « en attente ».
create function private.sync_commission_on_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'recorded' then
    update public.partner_commissions c set status = 'approved', approved_at = now()
    where c.client_id = new.client_id and c.status = 'pending';
  elsif new.status = 'voided' and not private.client_has_paid(new.client_id) then
    update public.partner_commissions c set status = 'pending', approved_at = null
    where c.client_id = new.client_id and c.status = 'approved';
  end if;
  return new;
end;
$$;

create trigger payments_sync_commission after insert or update of status on public.payments
for each row execute function private.sync_commission_on_payment();

-- Fonctions de l'agence ------------------------------------------------------------------------------

create function public.save_partner(
  p_organization_id uuid, p_partner_id uuid, p_name text, p_code text, p_phone text, p_email text,
  p_commission_minor bigint, p_currency text, p_notes text, p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code text := upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent gérer les partenaires.';
  end if;
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Indiquez le nom du partenaire (de 2 à 120 caractères).';
  end if;
  if v_code !~ '^[A-Z0-9-]{3,20}$' then
    raise exception 'Le code partenaire compte de 3 à 20 lettres, chiffres ou tirets (ex. AMINA-2026).';
  end if;
  if p_commission_minor is null or p_commission_minor < 0 or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Indiquez le montant de la commission (0 si aucune) et sa devise.';
  end if;
  begin
    if p_partner_id is null then
      insert into public.partners (organization_id, name, code, phone, email, commission_minor, currency, notes, is_active)
      values (p_organization_id, v_name, v_code, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''), p_commission_minor, p_currency,
        trim(coalesce(p_notes, '')), coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.partners p set name = v_name, code = v_code, phone = nullif(trim(p_phone), ''), email = nullif(lower(trim(p_email)), ''),
        commission_minor = p_commission_minor, currency = p_currency, notes = trim(coalesce(p_notes, '')), is_active = coalesce(p_is_active, true)
      where p.id = p_partner_id and p.organization_id = p_organization_id
      returning id into v_id;
      if v_id is null then
        raise exception 'Partenaire introuvable.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Le code « % » ou le nom « % » est déjà utilisé par un autre partenaire.', v_code, v_name;
  end;
  return v_id;
end;
$$;

-- Rattache un client à un partenaire (ou l'en détache) ; crée ou déplace sa commission.
create function public.set_client_partner(p_client_id uuid, p_partner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_partner public.partners;
  v_commission public.partner_commissions;
  v_paid boolean;
begin
  select * into v_client from public.clients c where c.id = p_client_id for update;
  if not found or not private.has_role(v_client.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Fiche introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if p_partner_id is not null then
    select * into v_partner from public.partners p where p.id = p_partner_id and p.organization_id = v_client.organization_id;
    if not found then
      raise exception 'Partenaire introuvable.';
    end if;
    if not v_partner.is_active then
      raise exception 'Ce partenaire est désactivé : réactivez-le avant de lui rattacher un client.';
    end if;
  end if;
  if v_client.partner_id is not distinct from p_partner_id then
    return;
  end if;
  select * into v_commission from public.partner_commissions c where c.client_id = v_client.id for update;
  if found and v_commission.status = 'paid' then
    raise exception 'La commission de ce client est déjà payée : son partenaire ne peut plus changer.';
  end if;

  update public.clients c set partner_id = p_partner_id where c.id = v_client.id;
  if p_partner_id is null then
    delete from public.partner_commissions c where c.client_id = v_client.id;
    insert into public.activity_events (organization_id, actor_id, client_id, text)
    values (v_client.organization_id, private.member_id(v_client.organization_id), v_client.id, 'Partenaire retiré de la fiche (commission supprimée).');
    return;
  end if;

  v_paid := private.client_has_paid(v_client.id);
  insert into public.partner_commissions (organization_id, partner_id, client_id, amount_minor, currency, status, approved_at)
  values (v_client.organization_id, v_partner.id, v_client.id, v_partner.commission_minor, v_partner.currency,
    case when v_paid then 'approved' else 'pending' end, case when v_paid then now() end)
  on conflict (client_id) do update set
    partner_id = excluded.partner_id, amount_minor = excluded.amount_minor, currency = excluded.currency,
    status = excluded.status, approved_at = excluded.approved_at, cancel_reason = null;
  insert into public.activity_events (organization_id, actor_id, client_id, text)
  values (v_client.organization_id, private.member_id(v_client.organization_id), v_client.id,
    format('Client apporté par le partenaire %s (code %s).', v_partner.name, v_partner.code));
end;
$$;

-- Ajuster le montant d'une commission encore due.
create function public.update_commission(p_id uuid, p_amount_minor bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_commission public.partner_commissions;
begin
  select * into v_commission from public.partner_commissions c where c.id = p_id for update;
  if not found or not private.has_role(v_commission.organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'Commission introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if v_commission.status in ('paid', 'cancelled') then
    raise exception 'Cette commission est déjà payée ou annulée : son montant ne change plus.';
  end if;
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'Montant invalide.';
  end if;
  update public.partner_commissions c set amount_minor = p_amount_minor where c.id = v_commission.id;
end;
$$;

-- Commission versée au partenaire.
create function public.pay_commission(p_id uuid, p_paid_at timestamptz, p_method text, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_commission public.partner_commissions;
  v_partner_name text;
begin
  select * into v_commission from public.partner_commissions c where c.id = p_id for update;
  if not found or not private.has_role(v_commission.organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'Commission introuvable, ou vous n''avez pas le droit de la payer.';
  end if;
  if v_commission.status <> 'approved' then
    raise exception 'Seule une commission « à payer » peut être versée (le client apporté doit avoir payé).';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then
    raise exception 'La date du versement ne peut pas être dans le futur.';
  end if;
  if char_length(trim(coalesce(p_method, ''))) not between 2 and 60 then
    raise exception 'Indiquez le moyen de versement.';
  end if;
  update public.partner_commissions c set status = 'paid', paid_at = p_paid_at, paid_method = trim(p_method),
    paid_reference = nullif(trim(coalesce(p_reference, '')), ''), paid_by = private.member_id(v_commission.organization_id)
  where c.id = v_commission.id;
  select p.name into v_partner_name from public.partners p where p.id = v_commission.partner_id;
  insert into public.activity_events (organization_id, actor_id, client_id, text)
  values (v_commission.organization_id, private.member_id(v_commission.organization_id), v_commission.client_id,
    format('Commission versée au partenaire %s (%s).', v_partner_name, trim(p_method)));
end;
$$;

create function public.cancel_commission(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_commission public.partner_commissions;
begin
  select * into v_commission from public.partner_commissions c where c.id = p_id for update;
  if not found or not private.has_role(v_commission.organization_id, array['owner', 'admin', 'accountant']) then
    raise exception 'Commission introuvable, ou vous n''avez pas le droit de l''annuler.';
  end if;
  if v_commission.status in ('paid', 'cancelled') then
    raise exception 'Cette commission est déjà payée ou annulée.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;
  update public.partner_commissions c set status = 'cancelled', cancel_reason = left(trim(p_reason), 300) where c.id = v_commission.id;
end;
$$;

-- Accès à l'espace partenaire ---------------------------------------------------------------------------

create function public.create_partner_access(p_partner_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_partner public.partners;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token uuid := gen_random_uuid();
begin
  select * into v_partner from public.partners p where p.id = p_partner_id for update;
  if not found or not private.has_role(v_partner.organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent ouvrir l''espace d''un partenaire.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  update public.partners p set access_token = v_token, access_email = v_email where p.id = v_partner.id;
  return v_token;
end;
$$;

create function public.revoke_partner_access(p_partner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_partner public.partners;
begin
  select * into v_partner from public.partners p where p.id = p_partner_id for update;
  if not found or not private.has_role(v_partner.organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent retirer l''accès d''un partenaire.';
  end if;
  update public.partners p set user_id = null, access_token = null, access_email = null where p.id = v_partner.id;
end;
$$;

-- Ce que voit la personne qui ouvre le lien (le jeton fait office de secret).
create function public.get_partner_access(p_token uuid)
returns table (agency_name text, partner_name text, email text)
language sql stable security definer set search_path = '' as $$
  select o.name, p.name, p.access_email
  from public.partners p join public.organizations o on o.id = p.organization_id
  where p.access_token = p_token and p.is_active;
$$;

create function public.accept_partner_access(p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_partner public.partners;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour ouvrir votre espace partenaire.';
  end if;
  select * into v_partner from public.partners p where p.access_token = p_token and p.is_active for update;
  if not found then
    raise exception 'Lien introuvable ou déjà utilisé : demandez-en un nouveau à l''agence.';
  end if;
  if v_partner.access_email <> v_email then
    raise exception 'Ce lien est destiné à une autre adresse e-mail (%).', v_partner.access_email;
  end if;
  update public.partners p set user_id = v_uid, access_token = null where p.id = v_partner.id;
end;
$$;

create function public.is_partner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partners p where p.user_id = auth.uid() and p.is_active);
$$;

-- Espace partenaire : seulement ses clients (prénom et initiale, avancement simple) et ses commissions.
create function public.partner_portal() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'agency_name', o.name,
    'partner_name', p.name,
    'code', p.code,
    'currency', p.currency,
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.first_name || ' ' || left(c.last_name, 1) || '.',
        'since', c.registered_at,
        'progress', case
          when c.status = 'prospect' then 'Premier contact'
          when exists (select 1 from public.cases k where k.client_id = c.id and k.status = 'active') then 'Dossier en cours'
          when exists (select 1 from public.cases k where k.client_id = c.id and k.status = 'closed') then 'Dossier terminé'
          else 'Client de l''agence'
        end,
        'commission_status', pc.status,
        'amount_minor', pc.amount_minor,
        'commission_currency', pc.currency,
        'approved_at', pc.approved_at,
        'paid_at', pc.paid_at
      ) order by c.registered_at desc)
      from public.clients c
      left join public.partner_commissions pc on pc.client_id = c.id and pc.partner_id = p.id
      where c.partner_id = p.id and c.archived_at is null
    ), '[]'::jsonb)
  ) order by o.name), '[]'::jsonb)
  from public.partners p join public.organizations o on o.id = p.organization_id
  where p.user_id = auth.uid() and p.is_active;
$$;

revoke all on function private.client_has_paid(uuid), private.sync_commission_on_payment() from public, anon, authenticated;
revoke all on function
  public.save_partner(uuid, uuid, text, text, text, text, bigint, text, text, boolean),
  public.set_client_partner(uuid, uuid),
  public.update_commission(uuid, bigint),
  public.pay_commission(uuid, timestamptz, text, text),
  public.cancel_commission(uuid, text),
  public.create_partner_access(uuid, text),
  public.revoke_partner_access(uuid),
  public.get_partner_access(uuid),
  public.accept_partner_access(uuid),
  public.is_partner(),
  public.partner_portal()
from public, anon;
grant execute on function
  public.save_partner(uuid, uuid, text, text, text, text, bigint, text, text, boolean),
  public.set_client_partner(uuid, uuid),
  public.update_commission(uuid, bigint),
  public.pay_commission(uuid, timestamptz, text, text),
  public.cancel_commission(uuid, text),
  public.create_partner_access(uuid, text),
  public.revoke_partner_access(uuid),
  public.get_partner_access(uuid),
  public.accept_partner_access(uuid),
  public.is_partner(),
  public.partner_portal()
to authenticated;
grant execute on function public.get_partner_access(uuid) to anon;
