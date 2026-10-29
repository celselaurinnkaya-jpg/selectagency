-- ==============================================================================
-- SELECT Agency — Schéma Complet & Migrations (Installation)
-- ==============================================================================
-- Sauvegarde / Renommage des anciennes tables usafatura pour éviter tout conflit
ALTER TABLE IF EXISTS public.clients RENAME TO usafatura_clients;
ALTER TABLE IF EXISTS public.payments RENAME TO usafatura_payments;


-- ==============================================================================
-- 20261028100000_fondations.sql
-- ==============================================================================

-- SELECT Agency — Fondations : agences, membres, invitations, compteurs et fonctions d'aide à la RLS.
--
-- Règles communes à toutes les migrations :
-- - chaque table métier porte organization_id : une agence ne voit jamais les données d'une autre ;
-- - les relations entre tables passent par des clés étrangères composites (organization_id, id),
--   ce qui empêche de rattacher une ligne à un enregistrement d'une autre agence ;
-- - les montants sont des entiers en unités mineures, accompagnés de leur devise ;
-- - les dates et heures sont stockées en UTC (timestamptz).

create schema if not exists private;
grant usage on schema private to authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Vrai uniquement pendant l'import de l'agence de démonstration : les numéros, dates et auteurs
-- fournis sont alors conservés au lieu d'être attribués par les triggers.
create function private.importing() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('select_agency.importing', true), '') = 'on';
$$;

-- Agences ---------------------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  city text not null default '' check (char_length(city) <= 80),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  timezone text not null check (char_length(timezone) between 3 and 64),
  receipt_prefix text not null default 'REC' check (receipt_prefix ~ '^[A-Z]{2,6}$'),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_touch before update on public.organizations
for each row execute function private.touch_updated_at();

-- Membres ---------------------------------------------------------------------------------------
-- user_id est vide pour les collègues fictifs de l'agence de démonstration (ils ne se connectent pas).

create table public.members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null default '' check (char_length(email) <= 254),
  role text not null check (role in ('owner', 'admin', 'agent', 'accountant', 'viewer')),
  job_title text not null default '' check (char_length(job_title) <= 80),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id)
);

create index members_user_idx on public.members (user_id);

-- Invitations -----------------------------------------------------------------------------------
-- Le lien d'invitation contient le jeton ; il est transmis par l'agence (e-mail, WhatsApp…).

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin', 'agent', 'accountant', 'viewer')),
  job_title text not null default '' check (char_length(job_title) <= 80),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  foreign key (organization_id, invited_by) references public.members (organization_id, id)
);

create index invitations_org_idx on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (email);

-- Compteurs de numérotation -------------------------------------------------------------------
-- Hors de l'API (schéma private). Le verrou de ligne pris par l'upsert garantit des numéros
-- uniques et sans trou, même lorsque deux paiements sont enregistrés au même moment.

create table private.counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  value bigint not null default 0,
  primary key (organization_id, kind)
);

create function private.next_counter(p_org uuid, p_kind text) returns bigint
language sql security definer set search_path = '' as $$
  insert into private.counters as c (organization_id, kind, value) values (p_org, p_kind, 1)
  on conflict (organization_id, kind) do update set value = c.value + 1
  returning c.value;
$$;

-- Numéro lisible : PRÉFIXE-ANNÉE-00042 (année dans le fuseau de l'agence).
create function private.formatted_number(p_org uuid, p_kind text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_timezone text;
begin
  select o.timezone into v_timezone from public.organizations o where o.id = p_org;
  return p_prefix || '-' || to_char(now() at time zone v_timezone, 'YYYY') || '-'
    || lpad(private.next_counter(p_org, p_kind)::text, 5, '0');
end;
$$;

-- Fonctions d'aide aux politiques RLS ------------------------------------------------------------
-- security definer : elles lisent members sans repasser par la RLS de members (sinon récursion).
-- Utilisées sous la forme « organization_id in (select private.my_org_ids()) » : évaluées une fois par requête.

create function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid());
$$;

create function private.org_ids_with_role(p_roles text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.role = any (p_roles);
$$;

create function private.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

create function private.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.organization_id = p_org and m.user_id = (select auth.uid());
$$;


-- ==============================================================================
-- 20261028100100_donnees_metier.sql
-- ==============================================================================

-- SELECT Agency — Données métier : clients, dossiers, étapes, pièces, agenda, tâches, finance, historique.
-- Les noms et valeurs reprennent les types de src/lib/domain/types.ts (snake_case côté base).

-- Clients ---------------------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null,
  client_type text not null check (client_type in ('individual', 'student', 'professional', 'company')),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text check (char_length(email) <= 254),
  phone_e164 text not null check (phone_e164 ~ '^\+[0-9]{6,15}$'),
  whatsapp_e164 text check (whatsapp_e164 ~ '^\+[0-9]{6,15}$'),
  residence_country text not null check (char_length(residence_country) between 1 and 80),
  city text not null default '' check (char_length(city) <= 80),
  preferred_language text not null default 'fr' check (char_length(preferred_language) <= 10),
  registered_at timestamptz not null default now(),
  assigned_to uuid not null,
  passport_last4 text check (char_length(passport_last4) <= 4),
  notes text check (char_length(notes) <= 2000),
  archived_at timestamptz,
  is_demo_fixture boolean not null default false,
  gender text check (char_length(gender) <= 20),
  birth_date date,
  nationality text check (char_length(nationality) <= 80),
  marital_status text check (char_length(marital_status) <= 30),
  id_doc_type text check (char_length(id_doc_type) <= 30),
  address text check (char_length(address) <= 250),
  service_motive text check (char_length(service_motive) <= 40),
  is_self_responsible boolean not null default true,
  guardian1 jsonb,
  guardian2 jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, reference),
  foreign key (organization_id, assigned_to) references public.members (organization_id, id)
);

create index clients_assigned_idx on public.clients (organization_id, assigned_to);
create trigger clients_touch before update on public.clients
for each row execute function private.touch_updated_at();

-- Numéro complet de la pièce d'identité : table à part, lisible seulement par owner, admin et agent
-- (le comptable et la lecture seule ne voient que les 4 derniers chiffres, dans clients.passport_last4).
create table public.client_sensitive (
  client_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  id_doc_number text check (char_length(id_doc_number) <= 50),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);

create trigger client_sensitive_touch before update on public.client_sensitive
for each row execute function private.touch_updated_at();

-- Dossiers --------------------------------------------------------------------------------------
-- version : verrou optimiste. Deux conseillers qui font avancer le même dossier en même temps ne
-- peuvent pas écraser le travail l'un de l'autre (voir apply_case_transition).

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null,
  client_id uuid not null,
  category text not null check (category in ('study_abroad', 'tourist_visa', 'business_travel', 'administrative_support', 'other_mobility', 'custom_trip')),
  title text not null check (char_length(title) between 3 and 120),
  destination_country text not null check (char_length(destination_country) between 1 and 80),
  residence_country text not null default '' check (char_length(residence_country) <= 80),
  status text not null default 'active' check (status in ('active', 'on_hold', 'cancelled', 'closed')),
  outcome text not null default 'pending' check (outcome in ('pending', 'approved', 'refused', 'withdrawn', 'completed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid not null,
  next_action text check (char_length(next_action) <= 200),
  next_action_due_at timestamptz,
  planned_departure_date date,
  billing_currency text not null check (billing_currency ~ '^[A-Z]{3}$'),
  applicant_tags text[] not null default '{}',
  details jsonb not null default '{}',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  template_key text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, reference),
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, assigned_to) references public.members (organization_id, id)
);

create index cases_client_idx on public.cases (organization_id, client_id);
create index cases_assigned_idx on public.cases (organization_id, assigned_to);
create trigger cases_touch before update on public.cases
for each row execute function private.touch_updated_at();

-- Copie du modèle d'étapes, propre à chaque dossier.
create table public.case_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid not null,
  position integer not null check (position > 0),
  key text not null check (char_length(key) <= 60),
  label text not null check (char_length(label) <= 160),
  kind text not null check (kind in ('agency_action', 'client_action', 'external_event', 'outcome', 'closure')),
  is_optional boolean not null default false,
  outcome text check (outcome in ('pending', 'approved', 'refused', 'withdrawn', 'completed')),
  next jsonb,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  confirmation_level text check (confirmation_level in ('expected', 'declared', 'confirmed')),
  evidence_ref text check (char_length(evidence_ref) <= 300),
  source_note text check (char_length(source_note) <= 300),
  note text check (char_length(note) <= 500),
  completed_at timestamptz,
  completed_by uuid,
  unique (case_id, key),
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete cascade,
  foreign key (organization_id, completed_by) references public.members (organization_id, id)
);

create index case_steps_case_idx on public.case_steps (organization_id, case_id);

-- Pièces attendues pour un dossier. Le fichier est dans Storage (bucket « documents »).
create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid not null,
  document_type_code text not null check (char_length(document_type_code) <= 60),
  label text not null check (char_length(label) <= 160),
  category text not null default '' check (char_length(category) <= 60),
  is_required boolean not null default true,
  status text not null default 'not_received' check (status in ('not_received', 'received', 'to_verify', 'validated', 'to_correct', 'expired', 'waived')),
  file_name text check (char_length(file_name) <= 200),
  storage_path text check (char_length(storage_path) <= 400),
  received_at timestamptz,
  expires_at date,
  review_comment text check (char_length(review_comment) <= 500),
  reviewed_by uuid,
  reviewed_at timestamptz,
  -- clock_timestamp() : chaque ligne d'un même envoi a son heure propre, ce qui garde l'ordre de la checklist.
  created_at timestamptz not null default clock_timestamp(),
  unique (case_id, document_type_code),
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete cascade,
  foreign key (organization_id, reviewed_by) references public.members (organization_id, id)
);

create index document_requirements_case_idx on public.document_requirements (organization_id, case_id);
create index document_requirements_status_idx on public.document_requirements (organization_id, status);

-- Agenda et tâches ------------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid,
  client_id uuid,
  kind text not null check (kind in ('consultation', 'prep_interview', 'administrative', 'application_deadline', 'document_deadline', 'follow_up', 'departure')),
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text check (char_length(location) <= 200),
  assigned_to uuid not null,
  status text not null default 'planned' check (status in ('planned', 'awaiting_confirmation', 'confirmed', 'done', 'cancelled')),
  external_reference text check (char_length(external_reference) <= 120),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, assigned_to) references public.members (organization_id, id)
);

create index appointments_starts_idx on public.appointments (organization_id, starts_at);
create index appointments_case_idx on public.appointments (organization_id, case_id);
create index appointments_client_idx on public.appointments (organization_id, client_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  case_id uuid,
  client_id uuid,
  assigned_to uuid not null,
  due_at timestamptz not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, assigned_to) references public.members (organization_id, id)
);

create index tasks_due_idx on public.tasks (organization_id, due_at);
create index tasks_case_idx on public.tasks (organization_id, case_id);
create trigger tasks_touch before update on public.tasks
for each row execute function private.touch_updated_at();

-- Finance ---------------------------------------------------------------------------------------
-- Prestation convenue (frais de l'agence ou montant pour un tiers), toujours dans la devise du dossier.

create table public.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid not null,
  label text not null check (char_length(label) between 2 and 160),
  charge_type text not null check (charge_type in ('agency_fee', 'third_party')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  original_amount jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, id),
  foreign key (organization_id, case_id) references public.cases (organization_id, id)
);

create index charges_case_idx on public.charges (organization_id, case_id);

-- Paiements : jamais modifiés ni supprimés. Le numéro de reçu est attribué par la base.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid not null,
  client_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method_kind text not null check (method_kind in ('cash', 'bank_transfer', 'mobile_money', 'other')),
  method_label text not null check (char_length(method_label) between 1 and 60),
  transaction_reference text check (char_length(transaction_reference) <= 80),
  payer_name text check (char_length(payer_name) <= 120),
  paid_at timestamptz not null,
  received_by uuid not null,
  status text not null default 'recorded' check (status in ('recorded', 'voided')),
  receipt_number text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, receipt_number),
  foreign key (organization_id, case_id) references public.cases (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, received_by) references public.members (organization_id, id)
);

create index payments_case_idx on public.payments (organization_id, case_id);
create index payments_client_idx on public.payments (organization_id, client_id);
create index payments_paid_idx on public.payments (organization_id, paid_at);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payment_id uuid not null,
  charge_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  unique (payment_id, charge_id),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete cascade,
  foreign key (organization_id, charge_id) references public.charges (organization_id, id)
);

create index payment_allocations_charge_idx on public.payment_allocations (organization_id, charge_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id uuid,
  expense_type text not null check (expense_type in ('operating', 'client_disbursement')),
  label text not null check (char_length(label) between 2 and 160),
  supplier text check (char_length(supplier) <= 120),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz not null,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references public.cases (organization_id, id),
  foreign key (organization_id, recorded_by) references public.members (organization_id, id)
);

create index expenses_paid_idx on public.expenses (organization_id, paid_at);

-- Historique et communications --------------------------------------------------------------------
-- Journal en ajout seul : aucune politique ne permet de modifier ou supprimer un événement.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid not null,
  client_id uuid,
  case_id uuid,
  text text not null check (char_length(text) between 1 and 600),
  foreign key (organization_id, actor_id) references public.members (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete cascade
);

create index activity_events_at_idx on public.activity_events (organization_id, at desc);
create index activity_events_case_idx on public.activity_events (organization_id, case_id);
create index activity_events_client_idx on public.activity_events (organization_id, client_id);

-- « Préparé, envoi manuel » : l'application ne prétend jamais qu'un message a été envoyé.
create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  at timestamptz not null default now(),
  client_id uuid not null,
  case_id uuid,
  channel text not null check (channel in ('whatsapp', 'email', 'phone', 'in_person')),
  status text not null check (status in ('prepared_manual', 'logged')),
  summary text not null check (char_length(summary) between 1 and 200),
  actor_id uuid not null,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete cascade,
  foreign key (organization_id, actor_id) references public.members (organization_id, id)
);

create index communication_logs_client_idx on public.communication_logs (organization_id, client_id);

-- Triggers : numéros, auteurs et cohérence des devises --------------------------------------------

create function private.assign_client_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.importing() then
    new.reference := private.formatted_number(new.organization_id, 'client', 'CLI');
  end if;
  return new;
end;
$$;

create function private.assign_case_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.importing() then
    new.reference := private.formatted_number(new.organization_id, 'case', 'DOS');
  end if;
  return new;
end;
$$;

create function private.assign_receipt_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
begin
  if not private.importing() then
    select o.receipt_prefix into v_prefix from public.organizations o where o.id = new.organization_id;
    new.receipt_number := private.formatted_number(new.organization_id, 'receipt', v_prefix);
  end if;
  return new;
end;
$$;

create trigger clients_reference before insert on public.clients
for each row execute function private.assign_client_reference();
create trigger cases_reference before insert on public.cases
for each row execute function private.assign_case_reference();
create trigger payments_receipt before insert on public.payments
for each row execute function private.assign_receipt_number();

-- L'auteur d'un événement est toujours la personne connectée, jamais une valeur envoyée par le navigateur.
create function private.set_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.importing() then
    new.actor_id := private.member_id(new.organization_id);
    new.at := now();
    if new.actor_id is null then
      raise exception 'Seul un membre de l''agence peut écrire dans son historique.';
    end if;
  end if;
  return new;
end;
$$;

create trigger activity_events_actor before insert on public.activity_events
for each row execute function private.set_actor();
create trigger communication_logs_actor before insert on public.communication_logs
for each row execute function private.set_actor();

create function private.set_expense_recorder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.importing() then
    new.recorded_by := private.member_id(new.organization_id);
    if new.recorded_by is null then
      raise exception 'Seul un membre de l''agence peut enregistrer une dépense.';
    end if;
  end if;
  return new;
end;
$$;

create trigger expenses_recorder before insert on public.expenses
for each row execute function private.set_expense_recorder();

-- Une prestation est toujours exprimée dans la devise de facturation du dossier : aucun total ne
-- mélange deux devises.
create function private.check_charge_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_currency text;
begin
  select c.billing_currency into v_currency
  from public.cases c
  where c.id = new.case_id and c.organization_id = new.organization_id;
  if v_currency is distinct from new.currency then
    raise exception 'La prestation doit être exprimée dans la devise du dossier (%).', v_currency;
  end if;
  return new;
end;
$$;

create trigger charges_currency before insert or update on public.charges
for each row execute function private.check_charge_currency();


-- ==============================================================================
-- 20261028100200_securite.sql
-- ==============================================================================

-- SELECT Agency — Sécurité : RLS sur toutes les tables, droits par rôle.
--
-- Rôles (voir src/lib/domain/labels.ts) :
--   lecture      : tous les membres de l'agence, sauf la finance (pas pour « lecture seule ») ;
--   « opérations » (clients, dossiers, pièces, agenda, tâches) : owner, admin, agent ;
--   « finance » (prestations, dépenses, événements) : owner, admin, agent, accountant ;
--   paramètres et invitations : owner, admin.
-- Les paiements ne s'écrivent que par la fonction record_payment (contrôles et numéro de reçu).
-- Le rôle anon (visiteur non connecté) n'a accès à aucune table.

alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.invitations enable row level security;
alter table public.clients enable row level security;
alter table public.client_sensitive enable row level security;
alter table public.cases enable row level security;
alter table public.case_steps enable row level security;
alter table public.document_requirements enable row level security;
alter table public.appointments enable row level security;
alter table public.tasks enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.activity_events enable row level security;
alter table public.communication_logs enable row level security;

-- Droits explicites (certains projets n'exposent plus les nouvelles tables automatiquement) : la
-- personne connectée peut adresser les tables, la RLS décide ensuite ligne par ligne.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on private.counters from public, anon, authenticated;

-- Lecture : tout membre de l'agence -------------------------------------------------------------

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select private.my_org_ids()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'clients', 'cases', 'case_steps', 'document_requirements', 'appointments', 'tasks',
    'activity_events', 'communication_logs'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (organization_id in (select private.my_org_ids()))',
      t
    );
  end loop;
  -- Le rôle « lecture seule » ne voit pas la finance.
  foreach t in array array['charges', 'payments', 'payment_allocations', 'expenses'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent'', ''accountant''])))',
      t
    );
  end loop;
end;
$$;

-- Opérations : propriétaire, administrateur, conseiller -------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'client_sensitive', 'cases', 'case_steps', 'document_requirements', 'appointments', 'tasks'] loop
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent''])))',
      t
    );
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent''])))
         with check (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent''])))',
      t
    );
  end loop;
end;
$$;

-- Numéro complet de la pièce d'identité : ni le comptable ni la lecture seule.
create policy client_sensitive_select on public.client_sensitive for select to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));

create policy tasks_delete on public.tasks for delete to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));
create policy appointments_delete on public.appointments for delete to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));

-- Supprimer une fiche client : réservé aux responsables. La base refuse de toute façon la
-- suppression d'un client qui a des dossiers (clé étrangère) : il faut alors l'archiver.
create policy clients_delete on public.clients for delete to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])));

create policy communication_logs_insert on public.communication_logs for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));

-- Finance et historique -------------------------------------------------------------------------

create policy charges_insert on public.charges for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

create policy expenses_insert on public.expenses for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Paramètres de l'agence et invitations ---------------------------------------------------------

create policy organizations_update on public.organizations for update to authenticated
  using (id in (select private.org_ids_with_role(array['owner', 'admin'])))
  with check (id in (select private.org_ids_with_role(array['owner', 'admin'])));

create policy invitations_select on public.invitations for select to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])));

create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    organization_id in (select private.org_ids_with_role(array['owner', 'admin']))
    and invited_by = private.member_id(organization_id)
    and accepted_at is null
  );

-- Mise à jour = annulation d'une invitation en attente.
create policy invitations_update on public.invitations for update to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])) and accepted_at is null)
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])) and accepted_at is null);

-- Droits d'exécution des fonctions d'aide ---------------------------------------------------------

revoke all on all functions in schema private from public;
grant execute on function
  private.my_org_ids(),
  private.org_ids_with_role(text[]),
  private.has_role(uuid, text[]),
  private.member_id(uuid),
  private.importing()
to authenticated;


-- ==============================================================================
-- 20261028100300_fonctions.sql
-- ==============================================================================

-- SELECT Agency — Fonctions appelées par l'application (RPC).
--
-- Une écriture composée (plusieurs tables) passe par une fonction : elle s'exécute dans une seule
-- transaction. Les fonctions « security invoker » restent soumises à la RLS ; les fonctions
-- « security definer » contrôlent elles-mêmes l'appartenance et le rôle, explicitement.
-- Les messages d'erreur sont écrits pour être affichés tels quels à l'utilisateur.

-- Agences ---------------------------------------------------------------------------------------

-- Un compte appartient à une seule agence (règle de lancement).
create function public.create_organization(
  p_name text,
  p_city text,
  p_country_code text,
  p_currency text,
  p_timezone text,
  p_receipt_prefix text,
  p_full_name text,
  p_job_title text,
  p_is_demo boolean default false,
  p_member_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Connectez-vous pour créer une agence.';
  end if;
  if exists (select 1 from public.members m where m.user_id = v_uid) then
    raise exception 'Votre compte est déjà rattaché à une agence.';
  end if;

  insert into public.organizations (name, city, country_code, currency, timezone, receipt_prefix, is_demo, created_by)
  values (trim(p_name), trim(coalesce(p_city, '')), p_country_code, p_currency, p_timezone, p_receipt_prefix, coalesce(p_is_demo, false), v_uid)
  returning id into v_org;

  insert into public.members (id, organization_id, user_id, full_name, email, role, job_title)
  values (coalesce(p_member_id, gen_random_uuid()), v_org, v_uid, trim(p_full_name), lower(coalesce(auth.jwt() ->> 'email', '')), 'owner', trim(coalesce(p_job_title, '')));

  return v_org;
end;
$$;

-- Force l'agence (et d'éventuels champs) sur chaque élément d'un tableau JSON.
create function private.with_org(p_items jsonb, p_org uuid, p_extra jsonb default '{}') returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(e || jsonb_build_object('organization_id', p_org) || p_extra), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
$$;

-- Remplit une agence de démonstration avec les données fictives préparées par l'application.
-- Réservé au propriétaire, aux agences marquées « démonstration » et encore vides. Les collègues
-- fictifs n'ont jamais de compte (user_id forcé à vide) ; l'agence est forcée sur chaque ligne.
create function public.import_demo_data(p_org uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner']) then
    raise exception 'Action réservée au propriétaire de l''agence.';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org and o.is_demo) then
    raise exception 'Les données fictives ne peuvent être chargées que dans une agence de démonstration.';
  end if;
  if exists (select 1 from public.clients c where c.organization_id = p_org) then
    raise exception 'Cette agence contient déjà des données.';
  end if;

  perform set_config('select_agency.importing', 'on', true);

  insert into public.members
    select * from jsonb_populate_recordset(null::public.members, private.with_org(p_data -> 'members', p_org, '{"user_id": null}'));
  insert into public.clients
    select * from jsonb_populate_recordset(null::public.clients, private.with_org(p_data -> 'clients', p_org));
  insert into public.cases
    select * from jsonb_populate_recordset(null::public.cases, private.with_org(p_data -> 'cases', p_org));
  insert into public.case_steps
    select * from jsonb_populate_recordset(null::public.case_steps, private.with_org(p_data -> 'case_steps', p_org));
  insert into public.document_requirements
    select * from jsonb_populate_recordset(null::public.document_requirements, private.with_org(p_data -> 'document_requirements', p_org, '{"storage_path": null}'));
  insert into public.appointments
    select * from jsonb_populate_recordset(null::public.appointments, private.with_org(p_data -> 'appointments', p_org));
  insert into public.tasks
    select * from jsonb_populate_recordset(null::public.tasks, private.with_org(p_data -> 'tasks', p_org));
  insert into public.charges
    select * from jsonb_populate_recordset(null::public.charges, private.with_org(p_data -> 'charges', p_org));
  insert into public.payments
    select * from jsonb_populate_recordset(null::public.payments, private.with_org(p_data -> 'payments', p_org));
  insert into public.payment_allocations
    select * from jsonb_populate_recordset(null::public.payment_allocations, private.with_org(p_data -> 'payment_allocations', p_org));
  insert into public.expenses
    select * from jsonb_populate_recordset(null::public.expenses, private.with_org(p_data -> 'expenses', p_org));
  insert into public.activity_events
    select * from jsonb_populate_recordset(null::public.activity_events, private.with_org(p_data -> 'activity_events', p_org));

  insert into private.counters (organization_id, kind, value)
    select p_org, c.key, c.value::bigint from jsonb_each_text(coalesce(p_data -> 'counters', '{}'::jsonb)) c
  on conflict (organization_id, kind) do update set value = excluded.value;

  perform set_config('select_agency.importing', 'off', true);
end;
$$;

-- Crée l'agence de démonstration et la remplit en une seule transaction : si l'import échoue, rien
-- n'est créé et le compte reste libre. p_member_id est l'identifiant (préparé par l'application)
-- que les données fictives utilisent pour le propriétaire.
create function public.create_demo_organization(p_name text, p_full_name text, p_member_id uuid, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  v_org := public.create_organization(p_name, 'Douala', 'CM', 'XAF', 'Africa/Douala', 'REC', p_full_name, 'Directeur d''agence', true, p_member_id);
  perform public.import_demo_data(v_org, p_data);
  return v_org;
end;
$$;

-- Supprime l'agence de démonstration de la personne connectée (propriétaire), avec toutes ses
-- données fictives, pour qu'elle puisse ensuite créer sa vraie agence.
create function public.leave_demo_organization() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select m.organization_id into v_org
  from public.members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.role = 'owner' and o.is_demo;
  if v_org is null then
    raise exception 'Seul le propriétaire d''une agence de démonstration peut la supprimer.';
  end if;
  delete from public.organizations o where o.id = v_org;
end;
$$;

-- Dossiers --------------------------------------------------------------------------------------

-- Ouvre un dossier avec sa copie du modèle d'étapes et sa liste de pièces (préparées par
-- l'application à partir des modèles). Le numéro DOS-… est attribué par la base.
create function public.create_case(p_case jsonb, p_steps jsonb, p_requirements jsonb, p_template_name text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_case public.cases;
begin
  insert into public.cases (
    organization_id, client_id, category, title, destination_country, residence_country, priority,
    assigned_to, next_action, next_action_due_at, planned_departure_date, billing_currency,
    applicant_tags, details, template_key
  )
  select
    r.organization_id, r.client_id, r.category, r.title, r.destination_country, coalesce(r.residence_country, ''),
    coalesce(r.priority, 'normal'), r.assigned_to, r.next_action, r.next_action_due_at, r.planned_departure_date,
    r.billing_currency, coalesce(r.applicant_tags, '{}'), coalesce(r.details, '{}'), r.template_key
  from jsonb_populate_record(null::public.cases, p_case) r
  returning * into v_case;

  insert into public.case_steps (
    organization_id, case_id, position, key, label, kind, is_optional, outcome, next, status, confirmation_level
  )
  select
    v_case.organization_id, v_case.id, s.position, s.key, s.label, s.kind, coalesce(s.is_optional, false),
    s.outcome, s.next, coalesce(s.status, 'pending'), s.confirmation_level
  from jsonb_populate_recordset(null::public.case_steps, coalesce(p_steps, '[]'::jsonb)) s;

  insert into public.document_requirements (organization_id, case_id, document_type_code, label, category, is_required, status)
  select v_case.organization_id, v_case.id, d.document_type_code, d.label, coalesce(d.category, ''), coalesce(d.is_required, true), 'not_received'
  from jsonb_populate_recordset(null::public.document_requirements, coalesce(p_requirements, '[]'::jsonb)) d;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id,
    format('Dossier %s ouvert (%s).', v_case.reference, p_template_name)
  );

  return jsonb_build_object('id', v_case.id, 'reference', v_case.reference);
end;
$$;

-- Enregistre un changement d'étape calculé par l'application (règles de src/features/workflows).
-- p_version doit être la version lue avant le calcul : sinon quelqu'un a modifié le dossier entre-temps.
create function public.apply_case_transition(p_case_id uuid, p_version integer, p_steps jsonb, p_case jsonb, p_event text)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_case public.cases;
begin
  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not found then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  if v_case.status <> 'active' then
    raise exception 'Ce dossier n''est pas modifiable.';
  end if;
  if v_case.version <> p_version then
    raise exception 'Ce dossier vient d''être modifié par une autre personne. Rechargez la page, puis recommencez.';
  end if;

  update public.case_steps s set
    status = x.status,
    confirmation_level = x.confirmation_level,
    evidence_ref = x.evidence_ref,
    source_note = x.source_note,
    note = x.note,
    completed_at = x.completed_at,
    completed_by = x.completed_by
  from jsonb_populate_recordset(null::public.case_steps, p_steps) x
  where s.id = x.id and s.case_id = p_case_id;

  update public.cases c set
    status = coalesce(p_case ->> 'status', c.status),
    outcome = coalesce(p_case ->> 'outcome', c.outcome),
    next_action = case when p_case ? 'next_action' then p_case ->> 'next_action' else c.next_action end,
    next_action_due_at = case when p_case ? 'next_action_due_at' then (p_case ->> 'next_action_due_at')::timestamptz else c.next_action_due_at end,
    closed_at = case when p_case ? 'closed_at' then (p_case ->> 'closed_at')::timestamptz else c.closed_at end,
    version = c.version + 1
  where c.id = p_case_id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id, p_event);

  return v_case.version + 1;
end;
$$;

-- Pièces ----------------------------------------------------------------------------------------

-- Vérification interne d'une pièce (« vérifiée par l'agence » n'est jamais une validation officielle).
create function public.review_requirement(p_requirement_id uuid, p_decision text, p_comment text, p_event text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_req public.document_requirements;
  v_client uuid;
begin
  if p_decision not in ('validated', 'to_correct') then
    raise exception 'Décision inconnue.';
  end if;
  select * into v_req from public.document_requirements r where r.id = p_requirement_id for update;
  if not found then
    raise exception 'Pièce introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if v_req.status not in ('received', 'to_verify') then
    raise exception 'Cette pièce n''est pas en attente de vérification.';
  end if;

  update public.document_requirements r set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = private.member_id(v_req.organization_id),
    review_comment = case when p_decision = 'to_correct' then p_comment end
  where r.id = p_requirement_id;

  select c.client_id into v_client from public.cases c where c.id = v_req.case_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_req.organization_id, private.member_id(v_req.organization_id), v_client, v_req.case_id, p_event);
end;
$$;

-- Rattache à une pièce le fichier que le navigateur vient de déposer dans Storage.
-- Le chemin doit être « agence/dossier/pièce/… » et le fichier doit exister.
create function public.register_requirement_file(p_requirement_id uuid, p_storage_path text, p_file_name text, p_event text)
returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_req public.document_requirements;
  v_client uuid;
begin
  select * into v_req from public.document_requirements r where r.id = p_requirement_id for update;
  if not found then
    raise exception 'Pièce introuvable, ou vous n''avez pas le droit de la modifier.';
  end if;
  if p_storage_path not like v_req.organization_id || '/' || v_req.case_id || '/' || v_req.id || '/%' then
    raise exception 'Emplacement du fichier invalide.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_storage_path) then
    raise exception 'Le fichier n''a pas été reçu. Recommencez l''envoi.';
  end if;

  update public.document_requirements r set
    status = 'received',
    file_name = left(p_file_name, 200),
    storage_path = p_storage_path,
    received_at = now(),
    review_comment = null,
    reviewed_at = null,
    reviewed_by = null
  where r.id = p_requirement_id;

  select c.client_id into v_client from public.cases c where c.id = v_req.case_id;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_req.organization_id, private.member_id(v_req.organization_id), v_client, v_req.case_id, p_event);

  -- Ancien fichier éventuel, à supprimer du stockage par l'application.
  return v_req.storage_path;
end;
$$;

-- Paiements -------------------------------------------------------------------------------------

-- Enregistre un paiement, sa répartition sur les prestations et le numéro de reçu, en une transaction.
-- Le dossier est verrouillé pendant l'opération : deux encaissements simultanés ne peuvent pas
-- dépasser ensemble le reste à payer. p_event peut contenir {recu}, remplacé par le numéro attribué.
create function public.record_payment(
  p_case_id uuid,
  p_amount_minor bigint,
  p_method_kind text,
  p_method_label text,
  p_transaction_reference text,
  p_payer_name text,
  p_paid_at timestamptz,
  p_allocations jsonb,
  p_event text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_payment public.payments;
  v_total bigint;
  v_invalid integer;
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

  select count(*) into v_invalid
  from jsonb_array_elements(p_allocations) a
  left join public.charges ch
    on ch.id = (a ->> 'charge_id')::uuid and ch.case_id = v_case.id and ch.organization_id = v_case.organization_id
  where ch.id is null
     or (a ->> 'amount_minor')::bigint <= 0
     or (a ->> 'amount_minor')::bigint > ch.amount_minor - coalesce((
          select sum(pa.amount_minor)
          from public.payment_allocations pa
          join public.payments p on p.id = pa.payment_id
          where pa.charge_id = ch.id and p.status = 'recorded'
        ), 0);
  if v_invalid > 0 then
    raise exception 'Le montant dépasse le reste à payer d''une prestation du dossier.';
  end if;

  insert into public.payments (
    organization_id, case_id, client_id, amount_minor, currency, method_kind, method_label,
    transaction_reference, payer_name, paid_at, received_by
  ) values (
    v_case.organization_id, v_case.id, v_case.client_id, p_amount_minor, v_case.billing_currency, p_method_kind,
    p_method_label, nullif(trim(p_transaction_reference), ''), nullif(trim(p_payer_name), ''), p_paid_at,
    private.member_id(v_case.organization_id)
  ) returning * into v_payment;

  insert into public.payment_allocations (organization_id, payment_id, charge_id, amount_minor)
  select v_case.organization_id, v_payment.id, (a ->> 'charge_id')::uuid, (a ->> 'amount_minor')::bigint
  from jsonb_array_elements(p_allocations) a;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (
    v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id,
    replace(p_event, '{recu}', v_payment.receipt_number)
  );

  return jsonb_build_object('id', v_payment.id, 'receipt_number', v_payment.receipt_number);
end;
$$;

-- Invitations -----------------------------------------------------------------------------------

-- Ce que voit la personne invitée avant d'accepter (le jeton fait office de secret).
create function public.get_invitation(p_token uuid)
returns table (agency_name text, email text, role text, status text)
language sql stable security definer set search_path = '' as $$
  select o.name, i.email, i.role,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token;
$$;

-- Invitations en attente pour l'adresse e-mail du compte connecté.
create function public.my_invitations()
returns table (token uuid, agency_name text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.token, o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at >= now()
  order by i.created_at desc;
$$;

create function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations;
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

-- Droits : uniquement les utilisateurs connectés ------------------------------------------------

revoke all on function
  public.create_organization(text, text, text, text, text, text, text, text, boolean, uuid),
  public.create_demo_organization(text, text, uuid, jsonb),
  public.leave_demo_organization(),
  public.import_demo_data(uuid, jsonb),
  public.create_case(jsonb, jsonb, jsonb, text),
  public.apply_case_transition(uuid, integer, jsonb, jsonb, text),
  public.review_requirement(uuid, text, text, text),
  public.register_requirement_file(uuid, text, text, text),
  public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text),
  public.get_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid)
from public, anon;

grant execute on function
  public.create_organization(text, text, text, text, text, text, text, text, boolean, uuid),
  public.create_demo_organization(text, text, uuid, jsonb),
  public.leave_demo_organization(),
  public.import_demo_data(uuid, jsonb),
  public.create_case(jsonb, jsonb, jsonb, text),
  public.apply_case_transition(uuid, integer, jsonb, jsonb, text),
  public.review_requirement(uuid, text, text, text),
  public.register_requirement_file(uuid, text, text, text),
  public.record_payment(uuid, bigint, text, text, text, text, timestamptz, jsonb, text),
  public.get_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid)
to authenticated;

-- La page d'invitation s'affiche aussi avant la connexion (le lien contient le jeton).
grant execute on function public.get_invitation(uuid) to anon;

revoke all on function private.with_org(jsonb, uuid, jsonb) from public;


-- ==============================================================================
-- 20261028100400_stockage.sql
-- ==============================================================================

-- SELECT Agency — Stockage des pièces des clients (Supabase Storage).
--
-- Bucket privé : aucun fichier n'a d'adresse publique. L'application crée des liens signés de
-- courte durée pour les consulter. Chemin imposé : {agence}/{dossier}/{pièce}/{horodatage}-{nom}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Le premier dossier du chemin est l'agence : on compare en texte pour ne jamais échouer sur un
-- chemin mal formé.
create function private.document_path_allowed(p_name text, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.user_id = (select auth.uid())
      and m.organization_id::text = split_part(p_name, '/', 1)
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.document_path_allowed(text, text[]) from public;
grant execute on function private.document_path_allowed(text, text[]) to authenticated;

create policy select_agency_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.document_path_allowed(name, array['owner', 'admin', 'agent', 'accountant']));

create policy select_agency_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.document_path_allowed(name, array['owner', 'admin', 'agent']));

create policy select_agency_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.document_path_allowed(name, array['owner', 'admin', 'agent']));

