-- SELECT Agency — Une facture ne passe « payée » qu'avec un vrai paiement (rapport de re-test du 22 novembre 2026).
--
-- Avant : « Marquer comme payée » soldait une facture sans paiement ni reçu. Désormais :
-- - seul le propriétaire de l'agence marque une facture payée (mark_invoice_paid), en désignant le ou les
--   paiements confirmés (avec reçu) qui la règlent : même client, même dossier si la facture en cite un,
--   même devise, et un total au moins égal au montant de la facture ;
-- - un paiement ne règle qu'une seule facture (table invoice_payments) ;
-- - si l'un de ces paiements est annulé, la facture redevient « à payer » automatiquement, avec une trace ;
-- - set_invoice_status ne permet plus de passer à « payée » ; seul le propriétaire remet une facture
--   payée « à payer » (les liens avec les paiements sont alors retirés).

create table public.invoice_payments (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invoice_id, payment_id),
  unique (payment_id)
);

create index invoice_payments_org_idx on public.invoice_payments (organization_id);
alter table public.invoice_payments enable row level security;
revoke all on public.invoice_payments from anon;
revoke insert, update, delete on public.invoice_payments from authenticated;
grant select on public.invoice_payments to authenticated;
create policy invoice_payments_select on public.invoice_payments for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Facture payée par le propriétaire, avec les paiements qui la règlent. p_event : « {facture} » et « {recus} ».
create function public.mark_invoice_paid(p_invoice_id uuid, p_payment_ids uuid[], p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_count integer;
  v_total bigint;
  v_receipts text;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found or not private.has_role(v_invoice.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Facture introuvable.';
  end if;
  if not private.has_role(v_invoice.organization_id, array['owner']) then
    raise exception 'Seul le propriétaire de l''agence marque une facture payée.';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'Seule une facture émise, en attente de paiement, peut être marquée payée.';
  end if;
  if p_payment_ids is null or cardinality(p_payment_ids) = 0 then
    raise exception 'Choisissez le ou les paiements confirmés qui règlent cette facture.';
  end if;

  select count(*), coalesce(sum(p.amount_minor), 0), string_agg(p.receipt_number, ', ' order by p.receipt_number)
  into v_count, v_total, v_receipts
  from public.payments p
  where p.id = any (p_payment_ids)
    and p.organization_id = v_invoice.organization_id
    and p.status = 'recorded'
    and p.client_id = v_invoice.client_id
    and (v_invoice.case_id is null or p.case_id = v_invoice.case_id)
    and p.currency = v_invoice.currency
    and not exists (select 1 from public.invoice_payments ip where ip.payment_id = p.id);
  if v_count <> (select count(distinct x) from unnest(p_payment_ids) as x) then
    raise exception 'Un paiement choisi ne convient pas : il doit être confirmé (avec reçu), du même client, du même dossier, dans la même devise, et ne régler aucune autre facture.';
  end if;
  if v_total < v_invoice.total_minor then
    raise exception 'Les paiements choisis ne couvrent pas le montant de la facture.';
  end if;

  insert into public.invoice_payments (organization_id, invoice_id, payment_id)
  select v_invoice.organization_id, v_invoice.id, x from (select distinct unnest(p_payment_ids) as x) s;
  update public.invoices i set status = 'paid', paid_at = now() where i.id = v_invoice.id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_invoice.client_id, v_invoice.case_id,
    replace(replace(p_event, '{facture}', v_invoice.number), '{recus}', coalesce(v_receipts, ''))
  );
end;
$$;

-- Étapes d'une facture, sans le passage à « payée » (réservé à mark_invoice_paid).
create or replace function public.set_invoice_status(p_invoice_id uuid, p_status text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found or not private.has_role(v_invoice.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Facture introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if p_status = 'paid' then
    raise exception 'Pour marquer une facture payée, le propriétaire choisit les paiements confirmés qui la règlent.';
  end if;
  if not (
    (v_invoice.status = 'draft' and p_status in ('issued', 'cancelled'))
    or (v_invoice.status = 'issued' and p_status = 'cancelled')
    or (v_invoice.status = 'paid' and p_status = 'issued')
  ) then
    raise exception 'Cette facture ne peut pas passer à cet état.';
  end if;
  if v_invoice.status = 'paid' and not private.has_role(v_invoice.organization_id, array['owner']) then
    raise exception 'Seul le propriétaire de l''agence remet une facture payée « à payer ».';
  end if;

  if v_invoice.status = 'paid' then
    delete from public.invoice_payments ip where ip.invoice_id = v_invoice.id;
  end if;
  update public.invoices i set
    status = p_status,
    issued_at = case when p_status = 'issued' then coalesce(i.issued_at, now()) else i.issued_at end,
    paid_at = case when p_status = 'issued' then null else i.paid_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else i.cancelled_at end
  where i.id = v_invoice.id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_invoice.client_id, v_invoice.case_id, replace(p_event, '{facture}', v_invoice.number));
end;
$$;

-- Paiement annulé : la facture qu'il réglait redevient « à payer », avec une trace dans l'historique.
create function private.reopen_invoices_of_voided_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
begin
  for v_invoice in
    select i.* from public.invoices i
    join public.invoice_payments ip on ip.invoice_id = i.id
    where ip.payment_id = new.id and i.status = 'paid'
  loop
    delete from public.invoice_payments ip where ip.invoice_id = v_invoice.id;
    update public.invoices i set status = 'issued', paid_at = null where i.id = v_invoice.id;
    insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
    values (
      v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_invoice.client_id, v_invoice.case_id,
      'Facture ' || v_invoice.number || ' remise « à payer » : le paiement' || coalesce(' (reçu ' || new.receipt_number || ')', '') || ' qui la réglait a été annulé.'
    );
  end loop;
  return new;
end;
$$;

create trigger payments_reopen_invoices after update of status on public.payments
for each row when (new.status = 'voided' and old.status is distinct from 'voided')
execute function private.reopen_invoices_of_voided_payment();

revoke all on function private.reopen_invoices_of_voided_payment() from public, anon, authenticated;
revoke all on function public.mark_invoice_paid(uuid, uuid[], text) from public, anon;
grant execute on function public.mark_invoice_paid(uuid, uuid[], text) to authenticated;
