-- Corriger une facture émise (demande de l'utilisateur du 24/11/2026).
--
-- Une facture émise reste verrouillée (règle comptable : le client a pu recevoir ce document et ce numéro).
-- « Corriger » fait en une seule fois, avec un motif obligatoire :
-- 1. retire du reste à payer du dossier le montant de la facture, s'il y avait été ajouté et qu'aucun paiement
--    n'y est encore réparti (sinon le client devrait l'ancienne et la nouvelle facture) ;
-- 2. annule la facture (elle reste visible, « Annulée », avec son numéro et le motif dans l'historique) ;
-- 3. crée un brouillon avec les mêmes lignes, daté du jour, portant « Remplace la facture … (annulée) », à
--    modifier puis à émettre sous un nouveau numéro.
-- Une facture payée se remet d'abord « à payer » (propriétaire) ; un brouillon se modifie directement.

create function public.correct_invoice(p_invoice_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_charge public.charges;
  v_reason text := trim(coalesce(p_reason, ''));
  v_today date;
  v_items jsonb;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found or not private.has_role(v_invoice.organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Facture introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if v_invoice.status = 'draft' then
    raise exception 'Un brouillon se modifie directement, avec le bouton « Modifier ».';
  elsif v_invoice.status = 'paid' then
    raise exception 'Cette facture est payée : la propriétaire la remet d''abord « à payer », puis elle peut être corrigée.';
  elsif v_invoice.status = 'cancelled' then
    raise exception 'Cette facture est déjà annulée.';
  end if;
  if char_length(v_reason) not between 5 and 300 then
    raise exception 'Indiquez le motif de la correction (de 5 à 300 caractères).';
  end if;

  -- 1. Montant déjà dans le reste à payer du dossier.
  select * into v_charge from public.charges c where c.invoice_id = v_invoice.id;
  if found then
    if exists (select 1 from public.payment_allocations a where a.charge_id = v_charge.id) then
      raise exception 'Un paiement est déjà enregistré sur le montant de cette facture dans le dossier : elle ne peut pas être corrigée ainsi. Annulez-la avec un motif, puis ajustez le dossier.';
    end if;
    delete from public.charges c where c.id = v_charge.id;
    insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
    values (v_invoice.organization_id, private.member_id(v_invoice.organization_id), v_invoice.client_id, v_invoice.case_id,
            format('Montant de la facture %s retiré du reste à payer du dossier (facture corrigée).', v_invoice.number));
  end if;

  -- 2. Annulation, avec le motif dans l'historique (et l'alerte au propriétaire, comme toute annulation).
  perform public.set_invoice_status(v_invoice.id, 'cancelled', format('Facture {facture} annulée pour correction. Motif : %s', v_reason));

  -- 3. Nouveau brouillon : mêmes lignes, mêmes conditions, daté du jour de l'agence.
  select jsonb_agg(
    jsonb_build_object('label', ii.label, 'quantity', ii.quantity, 'unit_amount_minor', ii.unit_amount_minor, 'tax_rate', ii.tax_rate)
    order by ii.position
  ) into v_items
  from public.invoice_items ii where ii.invoice_id = v_invoice.id;
  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = v_invoice.organization_id;

  return public.save_invoice(
    null, v_invoice.client_id, v_invoice.case_id, v_invoice.currency, v_today, greatest(v_invoice.due_date, v_today),
    v_invoice.discount_label, v_invoice.discount_minor, v_invoice.payment_details,
    left(concat_ws(E'\n', format('Remplace la facture %s (annulée).', v_invoice.number), v_invoice.notes), 1000),
    false, v_items,
    format('Facture {facture} préparée en brouillon pour corriger la facture %s.', v_invoice.number)
  );
end;
$$;

revoke all on function public.correct_invoice(uuid, text) from public, anon;
grant execute on function public.correct_invoice(uuid, text) to authenticated;
