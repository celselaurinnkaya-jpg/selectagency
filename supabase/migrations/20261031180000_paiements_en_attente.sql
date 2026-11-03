-- SELECT Agency — Paiements en attente de vérification.
--
-- Un paiement peut être saisi « en attente » : virement annoncé, Mobile Money pas encore vu sur le
-- compte de l'agence. Il n'a pas de numéro de reçu et ne compte pas dans les soldes, mais il réserve
-- sa part du reste à payer : deux saisies ne peuvent pas dépasser ensemble ce qui est dû. Vérifié, il
-- devient « recorded » et reçoit à ce moment son numéro de reçu : un reçu ne naît que d'un paiement
-- confirmé. Un paiement annoncé qui n'arrive jamais est annulé avec un motif (sans reçu).

alter table public.payments drop constraint payments_status_check;

alter table public.payments
  add constraint payments_status_check check (status in ('pending', 'recorded', 'voided')),
  alter column receipt_number drop not null,
  add column confirmed_at timestamptz,
  add column confirmed_by uuid,
  add foreign key (organization_id, confirmed_by) references public.members (organization_id, id);

-- Paiements déjà enregistrés : confirmés au moment de leur saisie, par la personne qui les a reçus.
update public.payments set confirmed_at = created_at, confirmed_by = received_by where confirmed_at is null;

alter table public.payments
  add constraint payments_receipt_check check (
    (status = 'pending' and receipt_number is null and confirmed_at is null)
    or (status = 'recorded' and receipt_number is not null and confirmed_at is not null)
    or status = 'voided'
  );

create index payments_confirmed_by_idx on public.payments (organization_id, confirmed_by);
create index payments_pending_idx on public.payments (organization_id) where status = 'pending';

-- Numéro de reçu : à l'enregistrement d'un paiement confirmé, ou quand un paiement en attente est vérifié.
create or replace function private.assign_receipt_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
begin
  -- Confirmé dès la saisie (ou importé avec la démonstration) : vérifié par la personne qui l'a reçu.
  if new.status = 'recorded' and new.confirmed_at is null then
    new.confirmed_at := now();
    new.confirmed_by := coalesce(new.confirmed_by, new.received_by);
  end if;
  if private.importing() or new.status <> 'recorded' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then
      return new;
    end if;
  end if;
  select o.receipt_prefix into v_prefix from public.organizations o where o.id = new.organization_id;
  new.receipt_number := private.formatted_number(new.organization_id, 'receipt', v_prefix);
  return new;
end;
$$;

create trigger payments_receipt_confirmed before update of status on public.payments
for each row when (old.status = 'pending' and new.status = 'recorded')
execute function private.assign_receipt_number();

-- Part d'une prestation déjà prise : paiements confirmés, et paiements en attente si demandé.
create function private.charge_taken(p_charge_id uuid, p_with_pending boolean) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(pa.amount_minor), 0)::bigint
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.charge_id = p_charge_id
    and (p.status = 'recorded' or (p_with_pending and p.status = 'pending'));
$$;

-- record_payment reçoit p_pending (faux par défaut : les appels existants gardent le même sens).
drop function public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text);

create function public.record_payment(
  p_case_id uuid,
  p_amount_minor bigint,
  p_method_kind text,
  p_method_label text,
  p_transaction_reference text,
  p_payer_name text,
  p_paid_at timestamptz,
  p_allocations jsonb,
  p_event text,
  p_pending boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_payment public.payments;
  v_member uuid;
  v_total bigint;
  v_invalid integer;
  v_pending boolean := coalesce(p_pending, false);
begin
  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not found or not private.has_role(v_case.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit d''y enregistrer un paiement.';
  end if;
  if v_case.status = 'cancelled' then
    raise exception 'Ce dossier est annulé : aucun paiement ne peut y être enregistré.';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Le montant doit être supérieur à zéro.';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then
    raise exception 'La date du paiement ne peut pas être dans le futur.';
  end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Le paiement doit être réparti sur au moins une prestation.';
  end if;

  select coalesce(sum((a ->> 'amount_minor')::bigint), 0) into v_total from jsonb_array_elements(p_allocations) a;
  if v_total <> p_amount_minor then
    raise exception 'La répartition du paiement ne correspond pas à son montant.';
  end if;

  -- Les paiements en attente réservent leur part : rien ne peut être encaissé deux fois.
  select count(*) into v_invalid
  from jsonb_array_elements(p_allocations) a
  left join public.charges ch
    on ch.id = (a ->> 'charge_id')::uuid and ch.case_id = v_case.id and ch.organization_id = v_case.organization_id
  where ch.id is null
     or (a ->> 'amount_minor')::bigint <= 0
     or (a ->> 'amount_minor')::bigint > ch.amount_minor - private.charge_taken(ch.id, true);
  if v_invalid > 0 then
    raise exception 'Le montant dépasse le reste à payer d''une prestation du dossier (paiements en attente de vérification compris).';
  end if;

  v_member := private.member_id(v_case.organization_id);
  insert into public.payments (
    organization_id, case_id, client_id, amount_minor, currency, method_kind, method_label,
    transaction_reference, payer_name, paid_at, received_by, status, confirmed_at, confirmed_by
  ) values (
    v_case.organization_id, v_case.id, v_case.client_id, p_amount_minor, v_case.billing_currency, p_method_kind,
    p_method_label, nullif(trim(p_transaction_reference), ''), nullif(trim(p_payer_name), ''), p_paid_at, v_member,
    case when v_pending then 'pending' else 'recorded' end,
    case when v_pending then null else now() end,
    case when v_pending then null else v_member end
  ) returning * into v_payment;

  insert into public.payment_allocations (organization_id, payment_id, charge_id, amount_minor)
  select v_case.organization_id, v_payment.id, (a ->> 'charge_id')::uuid, (a ->> 'amount_minor')::bigint
  from jsonb_array_elements(p_allocations) a;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_case.organization_id, v_member, v_case.client_id, v_case.id, replace(p_event, '{recu}', coalesce(v_payment.receipt_number, '')));

  return jsonb_build_object('id', v_payment.id, 'receipt_number', v_payment.receipt_number, 'status', v_payment.status);
end;
$$;

-- Vérification d'un paiement en attente : il compte dans les soldes et reçoit son numéro de reçu.
create function public.confirm_payment(p_payment_id uuid, p_event text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_case public.cases;
  v_invalid integer;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id;
  if not found or not private.has_role(v_payment.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Paiement introuvable, ou vous n''avez pas le droit de le vérifier.';
  end if;
  -- Même ordre de verrouillage que record_payment (dossier, puis paiement).
  select * into v_case from public.cases c where c.id = v_payment.case_id for update;
  select * into v_payment from public.payments p where p.id = p_payment_id for update;
  if v_payment.status <> 'pending' then
    raise exception 'Ce paiement n''est plus en attente de vérification.';
  end if;
  if v_case.status = 'cancelled' then
    raise exception 'Ce dossier est annulé : annulez aussi ce paiement en attente.';
  end if;
  -- Garde-fou : sa part tient toujours dans le reste à payer de chaque prestation.
  select count(*) into v_invalid
  from public.payment_allocations a
  join public.charges ch on ch.id = a.charge_id
  where a.payment_id = v_payment.id and a.amount_minor > ch.amount_minor - private.charge_taken(ch.id, false);
  if v_invalid > 0 then
    raise exception 'Ce paiement dépasse désormais le reste à payer du dossier : annulez-le, puis enregistrez le bon montant.';
  end if;

  update public.payments p set
    status = 'recorded', confirmed_at = now(), confirmed_by = private.member_id(v_payment.organization_id)
  where p.id = v_payment.id
  returning * into v_payment;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_payment.organization_id, private.member_id(v_payment.organization_id), v_payment.client_id, v_payment.case_id,
    replace(p_event, '{recu}', v_payment.receipt_number)
  );
  return jsonb_build_object('id', v_payment.id, 'receipt_number', v_payment.receipt_number);
end;
$$;

-- Annulation : un reçu confirmé reste réservé au propriétaire, à l'administrateur et au comptable ;
-- un paiement encore en attente (jamais arrivé, saisi par erreur) peut aussi être annulé par un conseiller.
create or replace function public.void_payment(p_payment_id uuid, p_reason text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id for update;
  if not found or not private.has_role(
    v_payment.organization_id,
    case when v_payment.status = 'pending' then array['owner', 'admin', 'agent', 'accountant'] else array['owner', 'admin', 'accountant'] end
  ) then
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

revoke all on function private.charge_taken(uuid, boolean) from public, anon, authenticated;

revoke all on function
  public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text, boolean),
  public.confirm_payment(uuid, text)
from public, anon;

grant execute on function
  public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text, boolean),
  public.confirm_payment(uuid, text)
to authenticated;
