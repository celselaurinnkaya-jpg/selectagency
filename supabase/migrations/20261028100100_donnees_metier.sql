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
