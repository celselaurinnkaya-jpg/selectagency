-- Rapport de test de la Console SELECT (23/11/2026) : pilotage des abonnements.
--
-- 1. Agences internes : les agences de l'équipe SELECT (actives sans paiement, par choix) gardent leur accès,
--    sont dispensées d'échéance et sortent des indicateurs (revenu, abonnements actifs, essais).
-- 2. Une agence cliente ne peut plus être « active » sans formule ni échéance.
-- 3. Tout changement d'abonnement est inscrit au journal, quelle qu'en soit l'origine (console, Stripe,
--    application, base de données) : la console inscrivait seulement ses propres actions.
-- 4. Échéance dépassée : l'agence est « en retard de paiement », puis passe en lecture seule après 7 jours de grâce.
-- 5. Vue d'ensemble : revenu mensuel récurrent (MRR), conversion des essais, résiliations.
-- 6. Support : la console corrige la catégorie d'une demande.
--
-- Aucune donnée existante n'est modifiée : le statut interne s'applique depuis la console, agence par agence.

-- 1. Agences internes ------------------------------------------------------------------------------------------

alter table public.subscriptions add column is_internal boolean not null default false;

comment on column public.subscriptions.is_internal is
  'Agence interne à SELECT (offerte) : accès inchangé, dispensée d''échéance, exclue des indicateurs de la console.';

-- 4. Écriture : 7 jours de grâce après l'échéance (sauf agence interne ou abonnement sans échéance) -----------
-- Reprend private.org_can_write (20261103130000_securite_demo.sql) en ajoutant seulement ce délai.

create or replace function private.org_can_write(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (o.is_demo and o.created_at > now() - interval '7 days')
      or (s.status in ('active', 'past_due')
          and (s.is_internal or s.current_period_end is null or s.current_period_end > now() - interval '7 days'))
      or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
    from public.organizations o
    left join public.subscriptions s on s.organization_id = o.id
    where o.id = p_org
  ), false);
$$;

revoke all on function private.org_can_write(uuid) from public, anon, authenticated;

-- 3. Journal de tous les changements d'abonnement ----------------------------------------------------------------
-- Les fonctions de la console posent « select_agency.console_subscription » : elles écrivent déjà leur ligne,
-- avec le motif. Les autres changements sont inscrits ici, avec leur origine :
-- - « stripe » : appel de l'API sans session (webhook Stripe) ;
-- - « application » : appel de l'API par une personne connectée ;
-- - « database » : éditeur SQL, script ou migration.

create function private.log_subscription_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_claims jsonb;
  v_source text;
  v_before jsonb;
  v_after jsonb;
begin
  if coalesce(current_setting('select_agency.console_subscription', true), '') = 'on' then
    return null;
  end if;
  v_after := jsonb_build_object(
    'plan_id', new.plan_id, 'status', new.status, 'trial_ends_at', new.trial_ends_at,
    'current_period_end', new.current_period_end, 'is_internal', new.is_internal
  );
  if tg_op = 'UPDATE' then
    v_before := jsonb_build_object(
      'plan_id', old.plan_id, 'status', old.status, 'trial_ends_at', old.trial_ends_at,
      'current_period_end', old.current_period_end, 'is_internal', old.is_internal
    );
    if v_before = v_after then
      return null;
    end if;
  end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_source := case
    when v_claims is null then 'database'
    when coalesce(v_claims ->> 'role', '') in ('anon', 'service_role') then 'stripe'
    else 'application'
  end;
  insert into private.platform_audit_log (actor_user_id, actor_email, action, organization_id, details)
  values (
    case when v_source = 'application' then (v_claims ->> 'sub')::uuid end,
    lower(coalesce(v_claims ->> 'email', '')),
    case when tg_op = 'INSERT' then 'subscription.created' else 'subscription.changed' end,
    new.organization_id,
    jsonb_build_object('source', v_source, 'before', v_before, 'after', v_after)
  );
  return null;
end;
$$;

create trigger subscriptions_log_change after insert or update on public.subscriptions
for each row execute function private.log_subscription_change();

revoke all on function private.log_subscription_change() from public, anon, authenticated;

-- 2. Modifier un abonnement depuis la console : formule et échéance obligatoires pour une agence cliente active --

create or replace function public.platform_update_subscription(
  p_org uuid, p_plan_id uuid, p_status text, p_trial_ends_at timestamptz, p_current_period_end timestamptz, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.subscriptions;
begin
  perform private.require_platform_admin();
  if p_status not in ('trialing', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Statut d''abonnement inconnu.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif de la modification : il est conservé dans le journal.';
  end if;
  if p_plan_id is not null and not exists (select 1 from public.plans p where p.id = p_plan_id) then
    raise exception 'Formule introuvable.';
  end if;
  select * into v_before from public.subscriptions s where s.organization_id = p_org for update;
  if not found then
    raise exception 'Agence introuvable, ou agence de démonstration (sans abonnement).';
  end if;
  if not v_before.is_internal and p_status in ('active', 'past_due') and (p_plan_id is null or p_current_period_end is null) then
    raise exception 'Un abonnement actif doit avoir une formule et une échéance (sauf pour une agence interne).';
  end if;

  perform set_config('select_agency.console_subscription', 'on', true);
  update public.subscriptions s set
    plan_id = p_plan_id, status = p_status, trial_ends_at = p_trial_ends_at, current_period_end = p_current_period_end
  where s.organization_id = p_org;

  perform private.log_platform_action('subscription.updated', p_org, jsonb_build_object(
    'reason', trim(p_reason),
    'before', jsonb_build_object('plan_id', v_before.plan_id, 'status', v_before.status, 'trial_ends_at', v_before.trial_ends_at, 'current_period_end', v_before.current_period_end),
    'after', jsonb_build_object('plan_id', p_plan_id, 'status', p_status, 'trial_ends_at', p_trial_ends_at, 'current_period_end', p_current_period_end)
  ));
end;
$$;

-- Paiement d'abonnement saisi dans la console : déjà inscrit au journal par la fonction elle-même.
create or replace function public.platform_record_subscription_payment(
  p_org uuid, p_plan_id uuid, p_amount_minor bigint, p_currency text, p_method_kind text, p_reference text,
  p_paid_at timestamptz, p_period_end timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_platform_admin();
  if not exists (select 1 from public.subscriptions s where s.organization_id = p_org) then
    raise exception 'Agence introuvable, ou agence de démonstration (sans abonnement).';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then
    raise exception 'La date du paiement ne peut pas être dans le futur.';
  end if;
  if p_period_end is not null and p_period_end <= p_paid_at then
    raise exception 'La nouvelle échéance doit être postérieure à la date du paiement.';
  end if;
  if p_plan_id is not null and not exists (select 1 from public.plans p where p.id = p_plan_id) then
    raise exception 'Formule introuvable.';
  end if;

  insert into public.subscription_payments (
    organization_id, plan_id, amount_minor, currency, method_kind, transaction_reference, paid_at, period_end, recorded_by
  ) values (
    p_org, p_plan_id, p_amount_minor, p_currency, p_method_kind, nullif(trim(coalesce(p_reference, '')), ''), p_paid_at, p_period_end, auth.uid()
  ) returning id into v_id;

  if p_period_end is not null then
    perform set_config('select_agency.console_subscription', 'on', true);
    update public.subscriptions s set
      status = 'active', current_period_end = p_period_end, plan_id = coalesce(p_plan_id, s.plan_id)
    where s.organization_id = p_org;
  end if;

  perform private.log_platform_action('subscription_payment.recorded', p_org, jsonb_build_object(
    'payment_id', v_id, 'amount_minor', p_amount_minor, 'currency', p_currency, 'method', p_method_kind,
    'reference', nullif(trim(coalesce(p_reference, '')), ''), 'period_end', p_period_end
  ));
  return v_id;
end;
$$;

-- 1. Marquer (ou non) une agence comme interne, avec un motif. L'accès de l'agence ne change pas.
create function public.platform_set_agency_internal(p_org uuid, p_internal boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.subscriptions;
begin
  perform private.require_platform_admin();
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif : il est conservé dans le journal.';
  end if;
  select * into v_before from public.subscriptions s where s.organization_id = p_org for update;
  if not found then
    raise exception 'Agence introuvable, ou agence de démonstration (sans abonnement).';
  end if;
  if v_before.is_internal = coalesce(p_internal, false) then
    raise exception 'Rien à changer : l''agence est déjà %.', case when v_before.is_internal then 'interne' else 'cliente' end;
  end if;
  perform set_config('select_agency.console_subscription', 'on', true);
  update public.subscriptions s set is_internal = coalesce(p_internal, false) where s.organization_id = p_org;
  perform private.log_platform_action(
    case when p_internal then 'subscription.internal_on' else 'subscription.internal_off' end,
    p_org,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

-- Liste des agences : statut interne, téléphone de l'agence (réglages des factures, pour relancer un paiement
-- par WhatsApp) et prix de la formule, en plus.
drop function public.platform_agencies();
create function public.platform_agencies()
returns table (
  id uuid, name text, city text, country_code text, currency text, is_demo boolean, created_at timestamptz,
  owner_name text, owner_email text, plan_id uuid, plan_name text, status text, trial_ends_at timestamptz,
  current_period_end timestamptz, members integer, clients integer, cases integer, cases_active integer,
  storage_bytes bigint, last_activity_at timestamptz, open_tickets integer, is_internal boolean, phone text,
  plan_price_minor bigint, plan_currency text, plan_billing_period text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select o.id, o.name, o.city, o.country_code, o.currency, o.is_demo, o.created_at,
    ow.full_name, ow.email, s.plan_id, p.name, s.status, s.trial_ends_at, s.current_period_end,
    private.active_member_count(o.id),
    (select count(*)::integer from public.clients c where c.organization_id = o.id),
    (select count(*)::integer from public.cases c where c.organization_id = o.id),
    (select count(*)::integer from public.cases c where c.organization_id = o.id and c.status = 'active'),
    (select coalesce(sum((so.metadata ->> 'size')::bigint), 0)::bigint from storage.objects so
      where so.bucket_id = 'documents' and split_part(so.name, '/', 1) = o.id::text),
    (select max(e.at) from public.activity_events e where e.organization_id = o.id),
    (select count(*)::integer from public.support_tickets t where t.organization_id = o.id and t.status = 'open'),
    coalesce(s.is_internal, false),
    nullif(trim(coalesce(inv.phone, '')), ''),
    p.price_minor, p.currency, p.billing_period
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans p on p.id = s.plan_id
  left join public.invoice_settings inv on inv.organization_id = o.id
  left join lateral (
    select m.full_name, m.email from public.members m
    where m.organization_id = o.id and m.role = 'owner' and m.removed_at is null
    order by m.created_at limit 1
  ) ow on true
  order by o.created_at desc;
end;
$$;

-- 5. Vue d'ensemble : agences internes à part, revenu mensuel récurrent, conversion des essais, résiliations. ---
create or replace function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform private.require_platform_admin();
  with clients_subs as (
    select s.* from public.subscriptions s
    join public.organizations o on o.id = s.organization_id
    where not o.is_demo and not s.is_internal
  )
  select jsonb_build_object(
    'agencies', (select count(*) from clients_subs),
    'internal_agencies', (select count(*) from public.subscriptions s join public.organizations o on o.id = s.organization_id where not o.is_demo and s.is_internal),
    'demo_agencies', (select count(*) from public.organizations o where o.is_demo),
    'trialing', (select count(*) from clients_subs s where s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now())),
    'trial_expired', (select count(*) from clients_subs s where s.status = 'trialing' and s.trial_ends_at <= now()),
    'trial_ending_soon', (select count(*) from clients_subs s where s.status = 'trialing' and s.trial_ends_at > now() and s.trial_ends_at <= now() + interval '7 days'),
    'active', (select count(*) from clients_subs s where s.status = 'active'),
    'past_due', (select count(*) from clients_subs s where s.status = 'past_due'),
    'suspended', (select count(*) from clients_subs s where s.status = 'suspended'),
    'cancelled', (select count(*) from clients_subs s where s.status = 'cancelled'),
    'period_overdue', (select count(*) from clients_subs s where s.status in ('active', 'past_due') and s.current_period_end < now()),
    -- Revenu mensuel récurrent : abonnements actifs (ou en retard) des agences clientes, ramenés au mois.
    'mrr', (
      select coalesce(jsonb_agg(jsonb_build_object('currency', x.currency, 'amount_minor', x.amount, 'subscriptions', x.n) order by x.currency), '[]'::jsonb)
      from (
        select p.currency,
          round(sum(p.price_minor::numeric / case p.billing_period when 'monthly' then 1 when 'quarterly' then 3 else 12 end))::bigint as amount,
          count(*) as n
        from clients_subs s join public.plans p on p.id = s.plan_id
        where s.status in ('active', 'past_due') and p.price_minor > 0
        group by p.currency
      ) x
    ),
    'mrr_by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan', x.name, 'currency', x.currency, 'amount_minor', x.amount, 'subscriptions', x.n) order by x.amount desc), '[]'::jsonb)
      from (
        select p.name, p.currency,
          round(sum(p.price_minor::numeric / case p.billing_period when 'monthly' then 1 when 'quarterly' then 3 else 12 end))::bigint as amount,
          count(*) as n
        from clients_subs s join public.plans p on p.id = s.plan_id
        where s.status in ('active', 'past_due') and p.price_minor > 0
        group by p.name, p.currency
      ) x
    ),
    -- Essais terminés (date passée ou statut changé) et, parmi eux, ceux qui ont payé au moins une fois.
    'trials_finished', (select count(*) from clients_subs s where s.status <> 'trialing' or s.trial_ends_at <= now()),
    'trials_converted', (
      select count(*) from clients_subs s
      where (s.status <> 'trialing' or s.trial_ends_at <= now())
        and exists (select 1 from public.subscription_payments sp where sp.organization_id = s.organization_id and sp.status = 'recorded')
    ),
    -- Résiliations des 30 derniers jours, lues dans le journal (console et changements hors console).
    'churned_last_30_days', (
      select count(distinct l.organization_id) from private.platform_audit_log l
      join clients_subs s on s.organization_id = l.organization_id
      where l.at >= now() - interval '30 days'
        and l.action in ('subscription.updated', 'subscription.changed')
        and l.details -> 'after' ->> 'status' = 'cancelled'
        and coalesce(l.details -> 'before' ->> 'status', '') <> 'cancelled'
    ),
    'users', (select count(*) from auth.users),
    'members', (select count(*) from public.members m join public.organizations o on o.id = m.organization_id where not o.is_demo and m.removed_at is null and m.user_id is not null),
    'clients', (select count(*) from public.clients c join public.organizations o on o.id = c.organization_id where not o.is_demo),
    'cases', (select count(*) from public.cases c join public.organizations o on o.id = c.organization_id where not o.is_demo),
    'cases_active', (select count(*) from public.cases c join public.organizations o on o.id = c.organization_id where not o.is_demo and c.status = 'active'),
    'cases_last_30_days', (select count(*) from public.cases c join public.organizations o on o.id = c.organization_id where not o.is_demo and c.opened_at >= now() - interval '30 days'),
    'files', (select count(*) from storage.objects so where so.bucket_id = 'documents'),
    'storage_bytes', (select coalesce(sum((so.metadata ->> 'size')::bigint), 0) from storage.objects so where so.bucket_id = 'documents'),
    'open_tickets', (select count(*) from public.support_tickets t where t.status = 'open'),
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object('month', x.month, 'count', x.count) order by x.month), '[]'::jsonb)
      from (
        select to_char(date_trunc('month', o.created_at at time zone 'UTC'), 'YYYY-MM') as month, count(*) as count
        from public.organizations o
        left join public.subscriptions s on s.organization_id = o.id
        where not o.is_demo and not coalesce(s.is_internal, false)
          and o.created_at >= date_trunc('month', now() at time zone 'UTC') - interval '5 months'
        group by 1
      ) x
    ),
    'revenue', (
      select coalesce(jsonb_agg(jsonb_build_object('month', x.month, 'currency', x.currency, 'amount_minor', x.amount) order by x.month, x.currency), '[]'::jsonb)
      from (
        select to_char(date_trunc('month', p.paid_at at time zone 'UTC'), 'YYYY-MM') as month, p.currency, sum(p.amount_minor) as amount
        from public.subscription_payments p
        where p.status = 'recorded' and p.paid_at >= date_trunc('month', now() at time zone 'UTC') - interval '5 months'
        group by 1, 2
      ) x
    )
  ) into v_result;
  return v_result;
end;
$$;

-- 6. Support : corriger la catégorie d'une demande (inscrit au journal). -----------------------------------------
create function public.platform_set_ticket_category(p_ticket_id uuid, p_category text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets;
  v_before text;
begin
  perform private.require_platform_admin();
  if p_category not in ('question', 'problem', 'billing', 'account', 'suggestion') then
    raise exception 'Catégorie inconnue.';
  end if;
  select t.category into v_before from public.support_tickets t where t.id = p_ticket_id for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  update public.support_tickets t set category = p_category where t.id = p_ticket_id returning * into v_ticket;
  perform private.log_platform_action('support.category_changed', v_ticket.organization_id,
    jsonb_build_object('ticket', v_ticket.reference, 'before', v_before, 'after', p_category));
end;
$$;

-- Droits d'exécution -------------------------------------------------------------------------------------------

revoke all on function
  public.platform_agencies(),
  public.platform_set_agency_internal(uuid, boolean, text),
  public.platform_set_ticket_category(uuid, text)
from public, anon;

grant execute on function
  public.platform_agencies(),
  public.platform_set_agency_internal(uuid, boolean, text),
  public.platform_set_ticket_category(uuid, text)
to authenticated;
