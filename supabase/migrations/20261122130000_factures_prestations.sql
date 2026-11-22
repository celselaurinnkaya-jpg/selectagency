-- SELECT Agency — Factures et prestations reliées : un seul reste à payer (rapport de re-test du 22 novembre 2026).
--
-- Une facture émise appartient à un dossier (voir save_invoice). Son montant entre dans le reste à payer du
-- dossier par une prestation liée à la facture (charges.invoice_id), créée sur décision d'une personne :
-- quand la facture reprend des prestations déjà convenues (devis accepté, saisie manuelle), on ne l'ajoute pas,
-- sinon le client devrait deux fois la même somme. Une facture ne s'ajoute qu'une fois.
-- Les paiements du dossier se répartissent ensuite sur cette prestation comme sur les autres, avec reçu.

-- Une facture ne s'émet que rattachée à un dossier du client (un brouillon peut attendre son dossier). Même
-- fonction que la migration 20261122100000, avec cette règle en plus.
create or replace function public.save_invoice(
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
    if v_invoice.status <> 'draft' then
      raise exception 'Une facture émise ne se modifie plus : annulez-la avec un motif, puis créez-en une nouvelle.';
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
  if p_issue_date > current_date + 1 then
    raise exception 'La date d''émission ne peut pas être dans le futur.';
  end if;
  -- Une facture émise appartient à un dossier : c'est le dossier qui encaisse, délivre les reçus et tient le
  -- reste à payer du client (rapport de re-test du 22 novembre 2026). Un brouillon peut attendre son dossier.
  if p_issue and p_case_id is null then
    raise exception 'Pour émettre une facture, choisissez le dossier du client : c''est le dossier qui encaisse et délivre les reçus.';
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
      status = case when p_issue then 'issued' else i.status end,
      issued_at = case when p_issue then now() else i.issued_at end
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

alter table public.charges add column invoice_id uuid references public.invoices (id) on delete set null;
create unique index charges_invoice_idx on public.charges (invoice_id) where invoice_id is not null;

create function public.add_invoice_to_charges(p_invoice_id uuid, p_charge_type text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_case public.cases;
  v_charge_id uuid;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found or not private.has_role(v_invoice.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Facture introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if v_invoice.status not in ('issued', 'paid') then
    raise exception 'Seule une facture émise s''ajoute au reste à payer du dossier.';
  end if;
  if v_invoice.case_id is null then
    raise exception 'Cette facture n''est liée à aucun dossier.';
  end if;
  if p_charge_type not in ('agency_fee', 'third_party') then
    raise exception 'Précisez s''il s''agit de frais de l''agence ou d''un montant pour un tiers.';
  end if;
  if exists (select 1 from public.charges c where c.invoice_id = v_invoice.id) then
    raise exception 'Cette facture est déjà dans le reste à payer du dossier.';
  end if;
  select * into v_case from public.cases c where c.id = v_invoice.case_id and c.organization_id = v_invoice.organization_id;
  if v_case.billing_currency is distinct from v_invoice.currency then
    raise exception 'La facture est en % et le dossier en % : le reste à payer du dossier ne mélange pas les devises.', v_invoice.currency, v_case.billing_currency;
  end if;

  insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency, invoice_id)
  values (v_invoice.organization_id, v_invoice.case_id, 'Facture ' || v_invoice.number, p_charge_type, v_invoice.total_minor, v_invoice.currency, v_invoice.id)
  returning id into v_charge_id;
  return v_charge_id;
end;
$$;

revoke all on function public.add_invoice_to_charges(uuid, text) from public, anon;
grant execute on function public.add_invoice_to_charges(uuid, text) to authenticated;
