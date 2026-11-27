-- SELECT Agency — Visibilité par bureau : cloisonnement complété (revue de sécurité du 27/11).
--
-- Quand le propriétaire active « visibilité par bureau » (organizations.restrict_by_bureau), un membre cloisonné
-- (ni propriétaire ni administrateur) ne doit ni voir ni modifier les fiches des autres bureaux. La migration
-- 20261125100000 l'appliquait aux tables principales ; la revue a trouvé deux trous :
--   1. des tables encore lisibles par toute l'agence : pièces déposées (document_files), réservations de services,
--      lignes des factures et des devis, répartition des paiements ;
--   2. les fonctions de la base (security definer) ne regardaient que le rôle, jamais le bureau : avec l'identifiant
--      d'un dossier d'un autre bureau, on pouvait y supprimer une pièce, y noter un paiement, ou s'ouvrir l'espace client.
-- Correctif :
--   1. règles « restrictives » sur ces tables, comme pour les autres ;
--   2. un contrôle (déclencheur) sur toutes les tables rattachées à un client ou à un dossier : une écriture faite par
--      une fonction de la base au nom d'un membre cloisonné est refusée si la fiche appartient à un autre bureau.
--      Les écritures directes par l'API restent contrôlées par les règles RLS ; les traitements du système (site web,
--      webhooks, envois planifiés : sans personne connectée) et les agences sans cloisonnement ne changent pas.
-- Choix maintenu : la messagerie WhatsApp de l'Agent IA (wa_*) reste commune à l'équipe.

-- 1. Lignes visibles d'un membre cloisonné, d'après leur parent -------------------------------------------------

create function private.restricted_visible_requirement_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.document_requirements r where r.case_id in (select private.restricted_visible_case_ids());
$$;

create function private.restricted_visible_service_client_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select sc.id from public.service_clients sc
  where sc.client_id in (select private.restricted_visible_client_ids())
    and (sc.case_id is null or sc.case_id in (select private.restricted_visible_case_ids()));
$$;

create function private.restricted_visible_invoice_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select i.id from public.invoices i
  where i.organization_id in (select private.my_restricted_org_ids())
    and (i.client_id is null or i.client_id in (select private.restricted_visible_client_ids()))
    and (i.case_id is null or i.case_id in (select private.restricted_visible_case_ids()));
$$;

create function private.restricted_visible_quote_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select q.id from public.quotes q
  where q.organization_id in (select private.my_restricted_org_ids())
    and (q.client_id is null or q.client_id in (select private.restricted_visible_client_ids()))
    and (q.case_id is null or q.case_id in (select private.restricted_visible_case_ids()));
$$;

create function private.restricted_visible_payment_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.payments p
  where p.organization_id in (select private.my_restricted_org_ids())
    and (p.client_id is null or p.client_id in (select private.restricted_visible_client_ids()))
    and (p.case_id is null or p.case_id in (select private.restricted_visible_case_ids()));
$$;

create policy document_files_bureau on public.document_files as restrictive for all to authenticated
  using (organization_id not in (select private.my_restricted_org_ids()) or requirement_id in (select private.restricted_visible_requirement_ids()));

create policy service_bookings_bureau on public.service_bookings as restrictive for all to authenticated
  using (organization_id not in (select private.my_restricted_org_ids()) or service_client_id in (select private.restricted_visible_service_client_ids()));

create policy invoice_items_bureau on public.invoice_items as restrictive for all to authenticated
  using (organization_id not in (select private.my_restricted_org_ids()) or invoice_id in (select private.restricted_visible_invoice_ids()));

create policy quote_items_bureau on public.quote_items as restrictive for all to authenticated
  using (organization_id not in (select private.my_restricted_org_ids()) or quote_id in (select private.restricted_visible_quote_ids()));

create policy payment_allocations_bureau on public.payment_allocations as restrictive for all to authenticated
  using (organization_id not in (select private.my_restricted_org_ids()) or payment_id in (select private.restricted_visible_payment_ids()));

-- 2. Écritures faites par les fonctions de la base ---------------------------------------------------------------

-- La ligne (avant ou après modification) est-elle dans les bureaux de la personne connectée ?
create function private.bureau_row_allowed(p_table text, p_row jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := nullif(p_row ->> 'organization_id', '')::uuid;
  v_client uuid := nullif(p_row ->> 'client_id', '')::uuid;
  v_case uuid := nullif(p_row ->> 'case_id', '')::uuid;
  v_bureau uuid;
begin
  if v_org is null or v_org not in (select private.my_restricted_org_ids()) then
    return true;
  end if;
  -- Fiche client : d'après son bureau (celui d'avant et celui d'après pour un transfert).
  if p_table = 'clients' then
    v_bureau := nullif(p_row ->> 'bureau_id', '')::uuid;
    return v_bureau is null or v_bureau in (select private.my_bureau_ids());
  end if;
  -- Lignes sans client ni dossier : d'après leur parent.
  if v_client is null and v_case is null then
    if p_row ? 'requirement_id' then
      select r.case_id into v_case from public.document_requirements r where r.id = nullif(p_row ->> 'requirement_id', '')::uuid;
    elsif p_row ? 'payment_id' then
      select p.client_id, p.case_id into v_client, v_case from public.payments p where p.id = nullif(p_row ->> 'payment_id', '')::uuid;
    elsif p_row ? 'invoice_id' then
      select i.client_id, i.case_id into v_client, v_case from public.invoices i where i.id = nullif(p_row ->> 'invoice_id', '')::uuid;
    elsif p_row ? 'quote_id' then
      select q.client_id, q.case_id into v_client, v_case from public.quotes q where q.id = nullif(p_row ->> 'quote_id', '')::uuid;
    elsif p_row ? 'service_client_id' then
      select sc.client_id, sc.case_id into v_client, v_case from public.service_clients sc where sc.id = nullif(p_row ->> 'service_client_id', '')::uuid;
    end if;
  end if;
  return (v_client is null or v_client in (select private.restricted_visible_client_ids()))
     and (v_case is null or v_case in (select private.restricted_visible_case_ids()));
end;
$$;

-- Déclencheur : s'exécute avec les droits de l'appelant pour savoir QUI écrit.
--   - écriture directe par l'API (rôle authenticated ou anon) : les règles RLS s'en chargent déjà ;
--   - aucune personne connectée (site web, webhooks, envois planifiés) ou import : rien à contrôler ;
--   - sinon (fonction de la base au nom d'un membre) : la fiche doit être dans ses bureaux.
create function private.bureau_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Tests séparés : en écriture directe, rien d'autre n'est évalué (pas d'appel aux fonctions privées).
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if auth.uid() is null or private.importing() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if (tg_op <> 'INSERT' and not private.bureau_row_allowed(tg_table_name, to_jsonb(old)))
     or (tg_op <> 'DELETE' and not private.bureau_row_allowed(tg_table_name, to_jsonb(new))) then
    raise exception 'Cette fiche appartient à un autre bureau que le vôtre : action refusée.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'client_sensitive', 'cases', 'case_steps', 'document_requirements', 'document_files',
    'appointments', 'tasks', 'payments', 'payment_allocations', 'charges', 'expenses',
    'activity_events', 'communication_logs', 'email_outbox',
    'quotes', 'quote_items', 'invoices', 'invoice_items',
    'service_clients', 'service_bookings', 'partner_commissions', 'client_portal_access'
  ] loop
    execute format(
      'create trigger zz_bureau_guard before insert or update or delete on public.%I
         for each row execute function private.bureau_guard()',
      t
    );
  end loop;
end;
$$;

-- Droits d'exécution ------------------------------------------------------------------------------------------------

revoke all on function
  private.restricted_visible_requirement_ids(),
  private.restricted_visible_service_client_ids(),
  private.restricted_visible_invoice_ids(),
  private.restricted_visible_quote_ids(),
  private.restricted_visible_payment_ids(),
  private.bureau_row_allowed(text, jsonb),
  private.bureau_guard()
from public, anon, authenticated;

-- Fonctions des règles de visibilité : appelées par les règles, donc ouvertes aux personnes connectées.
grant execute on function
  private.restricted_visible_requirement_ids(),
  private.restricted_visible_service_client_ids(),
  private.restricted_visible_invoice_ids(),
  private.restricted_visible_quote_ids(),
  private.restricted_visible_payment_ids()
to authenticated;
