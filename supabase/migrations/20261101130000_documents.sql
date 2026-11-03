-- SELECT Agency — Documents : solde restant sur les reçus, confirmations de réservation.
--
-- Reçu : le reste à payer du dossier est figé au moment où le paiement est confirmé. Un reçu
-- réimprimé plus tard affiche toujours le même chiffre, même si d'autres paiements ou prestations
-- arrivent ensuite.
--
-- Confirmation de réservation : document numéroté (CONF-AAAA-00001) que l'agence remplit sur le suivi
-- d'un client dans un service (hébergement, billet, assurance…) quand la réservation est obtenue :
-- prestataire, référence, dates, lieu, détails, montant. Écriture par fonctions, historique du client.

-- Solde restant après chaque paiement ------------------------------------------------------------------

alter table public.payments add column balance_after_minor bigint check (balance_after_minor >= 0);

-- Reste à payer d'un dossier : prestations convenues moins paiements confirmés (jamais négatif).
create function private.case_balance(p_case_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select greatest(0,
    coalesce((select sum(ch.amount_minor) from public.charges ch where ch.case_id = p_case_id), 0)
    - coalesce((select sum(p.amount_minor) from public.payments p where p.case_id = p_case_id and p.status = 'recorded'), 0)
  )::bigint;
$$;

create function private.snapshot_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'recorded' and (tg_op = 'INSERT' or old.status is distinct from 'recorded') then
    update public.payments p set balance_after_minor = private.case_balance(new.case_id) where p.id = new.id;
  end if;
  return null;
end;
$$;

create trigger payments_snapshot_balance after insert or update of status on public.payments
for each row execute function private.snapshot_balance();

-- Reçus existants : reste à payer après chacun, dans l'ordre des confirmations (prestations actuelles).
update public.payments p set balance_after_minor = x.balance
from (
  select p2.id,
    greatest(0,
      coalesce((select sum(ch.amount_minor) from public.charges ch where ch.case_id = p2.case_id), 0)
      - sum(p2.amount_minor) over (partition by p2.case_id order by p2.confirmed_at, p2.created_at, p2.id)
    )::bigint as balance
  from public.payments p2
  where p2.status = 'recorded'
) x
where x.id = p.id;

-- Confirmations de réservation --------------------------------------------------------------------------

create table public.service_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_client_id uuid not null,
  number text not null,
  provider text not null default '' check (char_length(provider) <= 120),
  reference text not null default '' check (char_length(reference) <= 80),
  start_date date,
  end_date date,
  place text not null default '' check (char_length(place) <= 200),
  details text not null default '' check (char_length(details) <= 1500),
  amount_minor bigint check (amount_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((amount_minor is null) = (currency is null)),
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, service_client_id) references public.service_clients (organization_id, id) on delete cascade,
  foreign key (organization_id, created_by) references public.members (organization_id, id)
);

create index service_bookings_link_idx on public.service_bookings (organization_id, service_client_id);
create index service_bookings_created_by_idx on public.service_bookings (organization_id, created_by);
create trigger service_bookings_touch before update on public.service_bookings for each row execute function private.touch_updated_at();

create function private.assign_booking_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.number := private.formatted_number(new.organization_id, 'booking', 'CONF');
  return new;
end;
$$;

create trigger service_bookings_number before insert on public.service_bookings
for each row execute function private.assign_booking_number();

alter table public.service_bookings enable row level security;
revoke all on public.service_bookings from anon;
revoke insert, update, delete on public.service_bookings from authenticated;
grant select on public.service_bookings to authenticated;
create policy service_bookings_select on public.service_bookings for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create function public.save_booking(
  p_booking_id uuid, p_service_client_id uuid, p_provider text, p_reference text, p_start_date date, p_end_date date,
  p_place text, p_details text, p_amount_minor bigint, p_currency text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.service_clients;
  v_booking public.service_bookings;
  v_service_name text;
begin
  select * into v_link from public.service_clients sc where sc.id = p_service_client_id;
  if not found or not private.has_role(v_link.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Suivi introuvable, ou vous n''avez pas le droit d''y préparer une confirmation.';
  end if;
  if trim(coalesce(p_provider, '')) = '' and trim(coalesce(p_reference, '')) = '' then
    raise exception 'Indiquez au moins le prestataire ou la référence de réservation.';
  end if;
  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
    raise exception 'La date de fin est avant la date de début.';
  end if;
  if (p_amount_minor is null) <> (p_currency is null) or p_amount_minor < 0 or (p_currency is not null and p_currency !~ '^[A-Z]{3}$') then
    raise exception 'Montant invalide : indiquez un montant et sa devise, ou laissez le montant vide.';
  end if;

  if p_booking_id is null then
    insert into public.service_bookings (organization_id, service_client_id, number, provider, reference, start_date, end_date, place, details, amount_minor, currency, created_by)
    values (v_link.organization_id, v_link.id, '', trim(coalesce(p_provider, '')), trim(coalesce(p_reference, '')), p_start_date, p_end_date,
      trim(coalesce(p_place, '')), trim(coalesce(p_details, '')), p_amount_minor, p_currency, private.member_id(v_link.organization_id))
    returning * into v_booking;
  else
    update public.service_bookings b set provider = trim(coalesce(p_provider, '')), reference = trim(coalesce(p_reference, '')),
      start_date = p_start_date, end_date = p_end_date, place = trim(coalesce(p_place, '')), details = trim(coalesce(p_details, '')),
      amount_minor = p_amount_minor, currency = p_currency
    where b.id = p_booking_id and b.service_client_id = v_link.id
    returning * into v_booking;
    if v_booking.id is null then
      raise exception 'Confirmation introuvable.';
    end if;
  end if;

  select s.name into v_service_name from public.services s where s.id = v_link.service_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_link.organization_id, private.member_id(v_link.organization_id), v_link.client_id, v_link.case_id,
    format('Confirmation de réservation %s %s (service « %s »).', v_booking.number, case when p_booking_id is null then 'préparée' else 'modifiée' end, v_service_name));
  return jsonb_build_object('id', v_booking.id, 'number', v_booking.number);
end;
$$;

create function public.delete_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.service_bookings;
  v_link public.service_clients;
begin
  select * into v_booking from public.service_bookings b where b.id = p_booking_id for update;
  if not found or not private.has_role(v_booking.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Confirmation introuvable, ou vous n''avez pas le droit de la supprimer.';
  end if;
  select * into v_link from public.service_clients sc where sc.id = v_booking.service_client_id;
  delete from public.service_bookings b where b.id = v_booking.id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_booking.organization_id, private.member_id(v_booking.organization_id), v_link.client_id, v_link.case_id,
    format('Confirmation de réservation %s supprimée.', v_booking.number));
end;
$$;

revoke all on function private.case_balance(uuid), private.snapshot_balance(), private.assign_booking_number() from public, anon, authenticated;
revoke all on function
  public.save_booking(uuid, uuid, text, text, date, date, text, text, bigint, text),
  public.delete_booking(uuid)
from public, anon;
grant execute on function
  public.save_booking(uuid, uuid, text, text, date, date, text, text, bigint, text),
  public.delete_booking(uuid)
to authenticated;
