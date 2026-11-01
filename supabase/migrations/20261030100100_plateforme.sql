-- SELECT Agency — Plateforme : administrateurs SELECT, formules, abonnements, paiements des
-- abonnements et journal de la console.
--
-- Séparation stricte entre l'espace agence et la console SELECT :
-- - une agence lit son propre abonnement (RLS) mais n'écrit rien dans ces tables ;
-- - la console n'a AUCUNE règle de lecture sur les tables des agences. Elle passe uniquement par les
--   fonctions « platform_* », qui vérifient le rôle et ne renvoient que des chiffres d'activité :
--   jamais les clients, les dossiers, les paiements ni les pièces des agences ;
-- - être administrateur plateforme exige la double authentification (« aal2 » dans le jeton).
--
-- Ajouter un administrateur se fait à la main, dans l'éditeur SQL de Supabase :
--   insert into private.platform_admins (user_id) select id from auth.users where email = 'adresse@exemple.com';

-- Administrateurs de la plateforme -------------------------------------------------------------

create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from public, anon, authenticated;

-- Vrai seulement pour un administrateur plateforme connecté avec la double authentification.
create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
    and exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid()));
$$;

create function private.require_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Accès réservé à l''équipe SELECT.' using errcode = '42501';
  end if;
end;
$$;

-- Ce que l'application doit montrer à la personne connectée : rien (« none »), la double
-- authentification à faire (« mfa ») ou la console (« ok »). Ne dit rien des autres comptes.
create function public.platform_access() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid())) then 'none'
    when coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then 'mfa'
    else 'ok'
  end;
$$;

-- Journal de la console : chaque action d'un administrateur plateforme, en ajout seul.
create table private.platform_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_email text not null default '',
  action text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  details jsonb not null default '{}'
);

create index platform_audit_log_at_idx on private.platform_audit_log (at desc);
create index platform_audit_log_org_idx on private.platform_audit_log (organization_id);
alter table private.platform_audit_log enable row level security;
revoke all on private.platform_audit_log from public, anon, authenticated;

create function private.log_platform_action(p_action text, p_org uuid, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into private.platform_audit_log (actor_user_id, actor_email, action, organization_id, details)
  values (auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), p_action, p_org, coalesce(p_details, '{}'));
$$;

-- Formules et abonnements ------------------------------------------------------------------------
-- Aucune formule n'est créée ici : les prix sont fixés par SELECT dans la console.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_period text not null check (billing_period in ('monthly', 'quarterly', 'yearly')),
  -- Nombre de membres actifs autorisés ; vide = sans limite.
  max_members integer check (max_members between 1 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_touch before update on public.plans
for each row execute function private.touch_updated_at();

-- Une ligne par agence réelle (les agences de démonstration n'ont pas d'abonnement).
create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_id uuid references public.plans (id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_plan_idx on public.subscriptions (plan_id);
create trigger subscriptions_touch before update on public.subscriptions
for each row execute function private.touch_updated_at();

-- Paiements reçus par SELECT pour un abonnement (Mobile Money, virement…), saisis par la console.
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid references public.plans (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method_kind text not null check (method_kind in ('cash', 'bank_transfer', 'mobile_money', 'other')),
  transaction_reference text check (char_length(transaction_reference) <= 80),
  paid_at timestamptz not null,
  -- Échéance accordée par ce paiement (vide si le paiement ne prolonge pas l'abonnement).
  period_end timestamptz,
  status text not null default 'recorded' check (status in ('recorded', 'voided')),
  void_reason text check (char_length(void_reason) <= 300),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index subscription_payments_org_idx on public.subscription_payments (organization_id, paid_at desc);
create index subscription_payments_plan_idx on public.subscription_payments (plan_id);
create index subscription_payments_recorded_by_idx on public.subscription_payments (recorded_by);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;

-- Les nouvelles tables du schéma public sont ouvertes par défaut aux visiteurs (anon) : on ferme.
revoke all on public.plans, public.subscriptions, public.subscription_payments from anon;
revoke insert, update, delete on public.plans, public.subscriptions, public.subscription_payments from authenticated;
grant select on public.plans, public.subscriptions, public.subscription_payments to authenticated;

-- Fonctions d'aide ---------------------------------------------------------------------------------

-- Lecture réservée à certains rôles, quel que soit l'état de l'abonnement (une agence suspendue
-- garde l'accès en lecture à ses données).
create function private.member_org_ids_with_role(p_roles text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.role = any (p_roles);
$$;

-- Une agence peut écrire si c'est une démonstration, si son essai court encore, ou si son
-- abonnement est actif (ou en retard de paiement : SELECT décide ensuite de la suspension).
create function private.org_can_write(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select o.is_demo
      or s.status in ('active', 'past_due')
      or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
    from public.organizations o
    left join public.subscriptions s on s.organization_id = o.id
    where o.id = p_org
  ), false);
$$;

-- À partir d'ici, org_ids_with_role et has_role (utilisées par toutes les règles d'écriture et par
-- record_payment) ne retiennent que les agences autorisées à écrire : une agence suspendue ou dont
-- l'essai est terminé passe en lecture seule, et c'est la base qui l'impose.
create or replace function private.org_ids_with_role(p_roles text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.role = any (p_roles) and private.org_can_write(m.organization_id);
$$;

create or replace function private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  ) and private.org_can_write(p_org);
$$;

-- Les règles de LECTURE qui utilisaient org_ids_with_role passent sur la fonction de lecture.
alter policy charges_select on public.charges
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));
alter policy payments_select on public.payments
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));
alter policy payment_allocations_select on public.payment_allocations
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));
alter policy expenses_select on public.expenses
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));
alter policy client_sensitive_select on public.client_sensitive
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent'])));
alter policy invitations_select on public.invitations
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin'])));

-- La gestion de l'équipe reste possible pendant une suspension (annuler une invitation).
alter policy invitations_update on public.invitations
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin'])) and accepted_at is null)
  with check (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin'])) and accepted_at is null);

-- Lecture par les agences : les formules proposées (et la leur, même retirée de l'offre), leur
-- propre abonnement, leurs paiements.
create policy plans_select on public.plans for select to authenticated
  using (is_active or id in (select s.plan_id from public.subscriptions s where s.organization_id in (select private.my_org_ids())));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin'])));

-- Abonnement créé avec l'agence : essai gratuit de 30 jours (durée modifiable ici ou, agence par
-- agence, depuis la console).
create function private.start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_demo then
    insert into public.subscriptions (organization_id, status, trial_ends_at)
    values (new.id, 'trialing', now() + interval '30 days');
  end if;
  return new;
end;
$$;

create trigger organizations_start_trial after insert on public.organizations
for each row execute function private.start_trial();

-- Agences inscrites avant les abonnements : actives, sans échéance, pour ne rien bloquer.
insert into public.subscriptions (organization_id, status)
select o.id, 'active' from public.organizations o where not o.is_demo
on conflict (organization_id) do nothing;

-- Limite de membres de la formule -----------------------------------------------------------------

create function private.member_limit(p_org uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select p.max_members from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = p_org;
$$;

create function private.active_member_count(p_org uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.members m where m.organization_id = p_org and m.removed_at is null and m.user_id is not null;
$$;

-- Une invitation réserve une place : membres actifs + invitations en attente ≤ limite.
create function private.check_invitation_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := private.member_limit(new.organization_id);
  v_pending integer;
begin
  if v_limit is not null then
    select count(*)::integer into v_pending from public.invitations i
    where i.organization_id = new.organization_id and i.accepted_at is null and i.revoked_at is null and i.expires_at >= now();
    if private.active_member_count(new.organization_id) + v_pending >= v_limit then
      raise exception 'Votre formule permet % membres (invitations en attente comprises). Pour agrandir l''équipe, contactez SELECT depuis la page Support.', v_limit;
    end if;
  end if;
  return new;
end;
$$;

create trigger invitations_limit before insert on public.invitations
for each row execute function private.check_invitation_limit();

-- accept_invitation : identique à la version précédente, avec le contrôle de la limite.
create or replace function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations;
  v_limit integer;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour accepter l''invitation.';
  end if;
  select * into v_inv from public.invitations i where i.token = p_token for update;
  if not found or v_inv.revoked_at is not null then
    raise exception 'Invitation introuvable ou annulée.';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Cette invitation a déjà été utilisée.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Cette invitation a expiré : demandez-en une nouvelle à l''agence.';
  end if;
  if v_inv.email <> v_email then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail (%).', v_inv.email;
  end if;
  if exists (select 1 from public.members m where m.user_id = v_uid) then
    raise exception 'Votre compte est déjà rattaché à une agence.';
  end if;
  v_limit := private.member_limit(v_inv.organization_id);
  if v_limit is not null and private.active_member_count(v_inv.organization_id) >= v_limit then
    raise exception 'L''équipe de cette agence est complète pour sa formule actuelle : prévenez la personne qui vous a invité.';
  end if;

  insert into public.members (organization_id, user_id, full_name, email, role, job_title)
  values (
    v_inv.organization_id, v_uid,
    coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), split_part(v_email, '@', 1)),
    v_email, v_inv.role, v_inv.job_title
  );
  update public.invitations i set accepted_at = now(), accepted_by = v_uid where i.id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

-- Lectures de la console ----------------------------------------------------------------------------
-- Uniquement des chiffres et les informations de compte : aucune donnée des clients des agences.

create function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'agencies', (select count(*) from public.organizations o where not o.is_demo),
    'demo_agencies', (select count(*) from public.organizations o where o.is_demo),
    'trialing', (select count(*) from public.subscriptions s where s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now())),
    'trial_expired', (select count(*) from public.subscriptions s where s.status = 'trialing' and s.trial_ends_at <= now()),
    'trial_ending_soon', (select count(*) from public.subscriptions s where s.status = 'trialing' and s.trial_ends_at > now() and s.trial_ends_at <= now() + interval '7 days'),
    'active', (select count(*) from public.subscriptions s where s.status = 'active'),
    'past_due', (select count(*) from public.subscriptions s where s.status = 'past_due'),
    'suspended', (select count(*) from public.subscriptions s where s.status = 'suspended'),
    'cancelled', (select count(*) from public.subscriptions s where s.status = 'cancelled'),
    'period_overdue', (select count(*) from public.subscriptions s where s.status in ('active', 'past_due') and s.current_period_end < now()),
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
        where not o.is_demo and o.created_at >= date_trunc('month', now() at time zone 'UTC') - interval '5 months'
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

create function public.platform_agencies()
returns table (
  id uuid, name text, city text, country_code text, currency text, is_demo boolean, created_at timestamptz,
  owner_name text, owner_email text, plan_id uuid, plan_name text, status text, trial_ends_at timestamptz,
  current_period_end timestamptz, members integer, clients integer, cases integer, cases_active integer,
  storage_bytes bigint, last_activity_at timestamptz, open_tickets integer
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
    (select count(*)::integer from public.support_tickets t where t.organization_id = o.id and t.status = 'open')
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans p on p.id = s.plan_id
  left join lateral (
    select m.full_name, m.email from public.members m
    where m.organization_id = o.id and m.role = 'owner' and m.removed_at is null
    order by m.created_at limit 1
  ) ow on true
  order by o.created_at desc;
end;
$$;

-- Membres des agences (comptes de l'équipe, pas les clients), avec leur dernière connexion.
create function public.platform_members(p_org uuid default null)
returns table (
  member_id uuid, organization_id uuid, organization_name text, is_demo boolean, user_id uuid, full_name text,
  email text, role text, job_title text, joined_at timestamptz, removed_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select m.id, m.organization_id, o.name, o.is_demo, m.user_id, m.full_name, m.email, m.role, m.job_title,
    m.created_at, m.removed_at, u.last_sign_in_at
  from public.members m
  join public.organizations o on o.id = m.organization_id
  left join auth.users u on u.id = m.user_id
  where (p_org is null or m.organization_id = p_org) and (m.user_id is not null or m.removed_at is not null)
  order by o.name, m.created_at;
end;
$$;

-- Tous les comptes inscrits, y compris ceux qui n'ont pas encore créé ni rejoint d'agence.
create function public.platform_users()
returns table (
  user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz,
  organization_id uuid, organization_name text, role text, is_platform_admin boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at, m.organization_id, o.name, m.role,
    exists (select 1 from private.platform_admins a where a.user_id = u.id)
  from auth.users u
  left join public.members m on m.user_id = u.id
  left join public.organizations o on o.id = m.organization_id
  order by u.created_at desc;
end;
$$;

create function public.platform_plans()
returns table (
  id uuid, name text, description text, price_minor bigint, currency text, billing_period text, max_members integer,
  is_active boolean, subscribers integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select p.id, p.name, p.description, p.price_minor, p.currency, p.billing_period, p.max_members, p.is_active,
    (select count(*)::integer from public.subscriptions s where s.plan_id = p.id and s.status in ('trialing', 'active', 'past_due'))
  from public.plans p
  order by p.is_active desc, p.price_minor, p.name;
end;
$$;

create function public.platform_payments(p_org uuid default null)
returns table (
  id uuid, organization_id uuid, organization_name text, plan_name text, amount_minor bigint, currency text,
  method_kind text, transaction_reference text, paid_at timestamptz, period_end timestamptz, status text,
  void_reason text, recorded_by_email text, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select sp.id, sp.organization_id, o.name, p.name, sp.amount_minor, sp.currency, sp.method_kind, sp.transaction_reference,
    sp.paid_at, sp.period_end, sp.status, sp.void_reason, u.email::text, sp.created_at
  from public.subscription_payments sp
  join public.organizations o on o.id = sp.organization_id
  left join public.plans p on p.id = sp.plan_id
  left join auth.users u on u.id = sp.recorded_by
  where p_org is null or sp.organization_id = p_org
  order by sp.paid_at desc, sp.created_at desc;
end;
$$;

create function public.platform_audit(p_org uuid default null, p_limit integer default 200)
returns table (id bigint, at timestamptz, actor_email text, action text, organization_id uuid, organization_name text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select l.id, l.at, l.actor_email, l.action, l.organization_id, o.name, l.details
  from private.platform_audit_log l
  left join public.organizations o on o.id = l.organization_id
  where p_org is null or l.organization_id = p_org
  order by l.at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

-- Écritures de la console ----------------------------------------------------------------------------

-- Créer (p_id vide) ou modifier une formule.
create function public.platform_save_plan(
  p_id uuid, p_name text, p_description text, p_price_minor bigint, p_currency text, p_billing_period text,
  p_max_members integer, p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_platform_admin();
  if p_id is null then
    insert into public.plans (name, description, price_minor, currency, billing_period, max_members, is_active)
    values (trim(p_name), trim(coalesce(p_description, '')), p_price_minor, p_currency, p_billing_period, p_max_members, coalesce(p_is_active, true))
    returning id into v_id;
    perform private.log_platform_action('plan.created', null, jsonb_build_object('plan', trim(p_name), 'price_minor', p_price_minor, 'currency', p_currency));
  else
    update public.plans p set
      name = trim(p_name), description = trim(coalesce(p_description, '')), price_minor = p_price_minor, currency = p_currency,
      billing_period = p_billing_period, max_members = p_max_members, is_active = coalesce(p_is_active, true)
    where p.id = p_id
    returning p.id into v_id;
    if v_id is null then
      raise exception 'Formule introuvable.';
    end if;
    perform private.log_platform_action('plan.updated', null, jsonb_build_object('plan', trim(p_name), 'price_minor', p_price_minor, 'currency', p_currency, 'is_active', coalesce(p_is_active, true)));
  end if;
  return v_id;
end;
$$;

-- Modifier l'abonnement d'une agence (formule, statut, dates). Le motif est inscrit au journal.
create function public.platform_update_subscription(
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

-- Enregistrer un paiement d'abonnement. Avec une nouvelle échéance, l'abonnement devient actif
-- jusqu'à cette date (et passe sur la formule payée).
create function public.platform_record_subscription_payment(
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

-- Annuler un paiement saisi par erreur. L'échéance de l'abonnement n'est pas modifiée : la console
-- la corrige si besoin, avec son propre motif.
create function public.platform_void_subscription_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.subscription_payments;
begin
  perform private.require_platform_admin();
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;
  select * into v_payment from public.subscription_payments p where p.id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;
  if v_payment.status = 'voided' then
    raise exception 'Ce paiement est déjà annulé.';
  end if;
  update public.subscription_payments p set status = 'voided', void_reason = trim(p_reason) where p.id = p_payment_id;
  perform private.log_platform_action('subscription_payment.voided', v_payment.organization_id, jsonb_build_object(
    'payment_id', p_payment_id, 'amount_minor', v_payment.amount_minor, 'currency', v_payment.currency, 'reason', trim(p_reason)
  ));
end;
$$;

-- Droits d'exécution ------------------------------------------------------------------------------

revoke all on function
  private.is_platform_admin(),
  private.require_platform_admin(),
  private.log_platform_action(text, uuid, jsonb),
  private.org_can_write(uuid),
  private.member_limit(uuid),
  private.active_member_count(uuid),
  private.start_trial(),
  private.check_invitation_limit()
from public, anon, authenticated;

revoke all on function private.member_org_ids_with_role(text[]) from public, anon;
grant execute on function private.member_org_ids_with_role(text[]) to authenticated;

revoke all on function
  public.platform_access(),
  public.platform_overview(),
  public.platform_agencies(),
  public.platform_members(uuid),
  public.platform_users(),
  public.platform_plans(),
  public.platform_payments(uuid),
  public.platform_audit(uuid, integer),
  public.platform_save_plan(uuid, text, text, bigint, text, text, integer, boolean),
  public.platform_update_subscription(uuid, uuid, text, timestamptz, timestamptz, text),
  public.platform_record_subscription_payment(uuid, uuid, bigint, text, text, text, timestamptz, timestamptz),
  public.platform_void_subscription_payment(uuid, text)
from public, anon;

grant execute on function
  public.platform_access(),
  public.platform_overview(),
  public.platform_agencies(),
  public.platform_members(uuid),
  public.platform_users(),
  public.platform_plans(),
  public.platform_payments(uuid),
  public.platform_audit(uuid, integer),
  public.platform_save_plan(uuid, text, text, bigint, text, text, integer, boolean),
  public.platform_update_subscription(uuid, uuid, text, timestamptz, timestamptz, text),
  public.platform_record_subscription_payment(uuid, uuid, bigint, text, text, text, timestamptz, timestamptz),
  public.platform_void_subscription_payment(uuid, text)
to authenticated;
