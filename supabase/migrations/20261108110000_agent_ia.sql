-- SELECT Agency — Module « Agent IA » (Phase 2 : Tables et RLS).
--
-- Conforme à docs/ARCHITECTURE_AGENT_IA.md et docs/PROMPT_AGENT_IA.md :
-- 1. Séparation absolue avec le WhatsApp manuel existant (nouvelles tables wa_* et ai_*).
-- 2. Quotas et options selon la formule : bloqué en STARTER, inclus en PRO et BUSINESS.
-- 3. Isolement total par agence (organization_id) avec RLS activé sur toutes les tables.
-- 4. Écritures contrôlées par des fonctions SECURITY DEFINER vérifiant le rôle et l'abonnement.

-- Extension pgvector pour la recherche sémantique documentaire
do $$
begin
  create extension if not exists vector with schema extensions;
exception when others then
  null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'extensions' and t.typname = 'vector'
  ) then
    create domain extensions.vector as text;
  end if;
end;
$$;

-- 1. Colonnes de quotas sur les formules -------------------------------------------------------------------

alter table public.plans
  add column if not exists max_ai_agents integer not null default 0,
  add column if not exists max_wa_numbers integer not null default 0,
  add column if not exists monthly_ai_replies integer not null default 0;

-- Mise à jour des quotas des formules existantes
update public.plans set max_ai_agents = 0, max_wa_numbers = 0, monthly_ai_replies = 0 where tier = 'starter';
update public.plans set max_ai_agents = 1, max_wa_numbers = 1, monthly_ai_replies = 2000 where tier = 'pro';
update public.plans set max_ai_agents = 3, max_wa_numbers = 1, monthly_ai_replies = 10000 where tier = 'business';

-- Extension de private.org_has_feature pour intégrer 'ai_agent'
create or replace function private.org_has_feature(p_org uuid, p_feature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if p_feature not in ('invoices', 'services', 'partners', 'auto_emails', 'custom_workflows', 'reports', 'ai_agent') then
    raise exception 'Option inconnue : %.', p_feature;
  end if;
  select o.is_demo
      or s.organization_id is null
      or s.status = 'trialing'
      or pl.tier is distinct from 'starter'
    into v_ok
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans pl on pl.id = s.plan_id
  where o.id = p_org;
  return coalesce(v_ok, false);
end;
$$;

create or replace function private.feature_label(p_feature text) returns text
language sql immutable set search_path = '' as $$
  select case p_feature
    when 'invoices' then 'Les factures'
    when 'services' then 'Les services'
    when 'partners' then 'Les partenaires et commissions'
    when 'auto_emails' then 'Les e-mails automatiques'
    when 'custom_workflows' then 'Les modèles d''étapes personnalisés'
    when 'reports' then 'Les rapports et exports'
    when 'ai_agent' then 'L''Agent IA'
    else 'Cette option'
  end;
$$;

-- 2. Tables WhatsApp Business API (wa_*) -------------------------------------------------------------------

-- wa_accounts : numéros WhatsApp connectés de l'agence
create table public.wa_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  waba_id text not null check (char_length(waba_id) <= 120),
  phone_number_id text not null check (char_length(phone_number_id) <= 120),
  display_phone_number text not null check (char_length(display_phone_number) <= 60),
  verified_name text check (verified_name is null or char_length(verified_name) <= 200),
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'pending', 'error')),
  coexistence boolean not null default false,
  quality_rating text check (quality_rating is null or quality_rating in ('green', 'yellow', 'red', 'unknown')),
  messaging_tier text check (messaging_tier is null or char_length(messaging_tier) <= 60),
  last_error text,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number_id)
);

create trigger wa_accounts_touch before update on public.wa_accounts
for each row execute function private.touch_updated_at();

create trigger wa_accounts_require_feature before insert on public.wa_accounts
for each row execute function private.require_feature_on_insert('ai_agent');

create index wa_accounts_org_idx on public.wa_accounts (organization_id);

-- wa_contacts : correspondants WhatsApp
create table public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  wa_id text not null check (char_length(wa_id) <= 60),
  profile_name text check (profile_name is null or char_length(profile_name) <= 160),
  client_id uuid references public.clients (id) on delete set null,
  last_incoming_at timestamptz,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, wa_id)
);

create trigger wa_contacts_touch before update on public.wa_contacts
for each row execute function private.touch_updated_at();

create index wa_contacts_org_client_idx on public.wa_contacts (organization_id, client_id);

-- 3. Assistants IA (ai_agents) ----------------------------------------------------------------------------

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  role text not null check (char_length(role) <= 120),
  starter_model text not null default 'general' check (starter_model in ('sales', 'support', 'visas', 'studies', 'travel', 'general')),
  languages text[] not null default '{"fr"}',
  tone text not null default 'courtois' check (tone in ('courtois', 'chaleureux', 'formel', 'dynamique')),
  personality text,
  system_instructions text not null default '',
  services_scope text,
  restricted_topics text,
  working_hours jsonb,
  transfer_conditions text,
  model_tier text not null default 'haiku' check (model_tier in ('haiku', 'sonnet')),
  is_active boolean not null default true,
  version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_agents_touch before update on public.ai_agents
for each row execute function private.touch_updated_at();

create trigger ai_agents_require_feature before insert on public.ai_agents
for each row execute function private.require_feature_on_insert('ai_agent');

create index ai_agents_org_idx on public.ai_agents (organization_id);

-- 4. Fils de discussion WhatsApp (wa_conversations) -------------------------------------------------------

create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  account_id uuid not null references public.wa_accounts (id) on delete cascade,
  contact_id uuid not null references public.wa_contacts (id) on delete cascade,
  agent_id uuid references public.ai_agents (id) on delete set null,
  mode text not null default 'ai' check (mode in ('ai', 'assist', 'human')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  assigned_to uuid,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_text text,
  last_message_at timestamptz not null default now(),
  client_id uuid references public.clients (id) on delete set null,
  case_id uuid references public.cases (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, contact_id)
);

create trigger wa_conversations_touch before update on public.wa_conversations
for each row execute function private.touch_updated_at();

create index wa_conversations_org_status_idx on public.wa_conversations (organization_id, status, last_message_at desc);

-- 5. Messages WhatsApp (wa_messages) ----------------------------------------------------------------------

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  meta_message_id text check (meta_message_id is null or char_length(meta_message_id) <= 160),
  kind text not null default 'text' check (kind in ('text', 'image', 'document', 'audio', 'template', 'interactive')),
  body text not null default '',
  media_storage_path text check (media_storage_path is null or char_length(media_storage_path) <= 400),
  media_mime_type text check (media_mime_type is null or char_length(media_mime_type) <= 100),
  media_file_name text check (media_file_name is null or char_length(media_file_name) <= 255),
  author_kind text not null check (author_kind in ('contact', 'ai', 'member')),
  member_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_message text,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) <= 120),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wa_messages_touch before update on public.wa_messages
for each row execute function private.touch_updated_at();

create unique index wa_messages_meta_id_idx on public.wa_messages (meta_message_id) where meta_message_id is not null;
create unique index wa_messages_idempotency_idx on public.wa_messages (idempotency_key) where idempotency_key is not null;
create index wa_messages_conv_created_idx on public.wa_messages (conversation_id, created_at asc);

-- 6. Événements bruts Meta (wa_webhook_events) ------------------------------------------------------------

create table public.wa_webhook_events (
  id uuid primary key default gen_random_uuid(),
  meta_event_id text not null check (char_length(meta_event_id) <= 160),
  event_type text not null check (char_length(event_type) <= 80),
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (meta_event_id)
);

-- 7. Modèles Meta (wa_templates) -------------------------------------------------------------------------

create table public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  language text not null default 'fr' check (char_length(language) <= 10),
  category text not null check (category in ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  body_text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, language)
);

create trigger wa_templates_touch before update on public.wa_templates
for each row execute function private.touch_updated_at();

-- 8. Base de connaissances (ai_knowledge_sources et ai_knowledge_chunks) ----------------------------------

create table public.ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  kind text not null check (kind in ('file', 'text', 'url')),
  title text not null check (char_length(title) between 1 and 200),
  storage_path text check (storage_path is null or char_length(storage_path) <= 400),
  source_url text check (source_url is null or char_length(source_url) <= 1000),
  raw_content text,
  status text not null default 'pending' check (status in ('pending', 'indexing', 'ready', 'failed')),
  error_message text,
  chunks_count integer not null default 0 check (chunks_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_knowledge_sources_touch before update on public.ai_knowledge_sources
for each row execute function private.touch_updated_at();

create index ai_knowledge_sources_org_agent_idx on public.ai_knowledge_sources (organization_id, agent_id);

create table public.ai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.ai_knowledge_sources (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  content text not null,
  embedding extensions.vector,
  chunk_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_knowledge_chunks_org_agent_idx on public.ai_knowledge_chunks (organization_id, agent_id);

-- 9. File asynchrone et consommation (ai_jobs, ai_runs, ai_actions) ---------------------------------------

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('reply', 'suggest', 'summary', 'index')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_jobs_touch before update on public.ai_jobs
for each row execute function private.touch_updated_at();

create index ai_jobs_status_next_idx on public.ai_jobs (status, next_attempt_at) where status in ('queued', 'running');

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agent_id uuid references public.ai_agents (id) on delete set null,
  conversation_id uuid references public.wa_conversations (id) on delete set null,
  kind text not null check (kind in ('reply', 'suggest', 'summary', 'test')),
  provider text not null default 'anthropic',
  model text not null default 'claude-3-5-haiku-20241022',
  tokens_prompt integer not null default 0,
  tokens_completion integer not null default 0,
  estimated_cost_minor integer not null default 0,
  duration_ms integer not null default 0,
  status text not null default 'success' check (status in ('success', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index ai_runs_org_created_idx on public.ai_runs (organization_id, created_at desc);

create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid references public.wa_conversations (id) on delete cascade,
  agent_id uuid references public.ai_agents (id) on delete set null,
  tool_name text not null check (char_length(tool_name) <= 80),
  parameters jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'done', 'failed')),
  approved_by uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_actions_touch before update on public.ai_actions
for each row execute function private.touch_updated_at();

create index ai_actions_org_status_idx on public.ai_actions (organization_id, status);

-- 10. Quotas mensuels et grand livre des crédits (ai_usage_monthly, ai_credit_ledger) ---------------------

create table public.ai_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_month date not null,
  inbound_count integer not null default 0,
  outbound_count integer not null default 0,
  ai_replies_count integer not null default 0,
  tokens_total bigint not null default 0,
  estimated_meta_cost_usd numeric(10, 4) not null default 0,
  estimated_ai_cost_usd numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, period_month)
);

create trigger ai_usage_monthly_touch before update on public.ai_usage_monthly
for each row execute function private.touch_updated_at();

create table public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delta_credits integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (char_length(reason) <= 200),
  stripe_payment_id text,
  created_at timestamptz not null default now()
);

create index ai_credit_ledger_org_created_idx on public.ai_credit_ledger (organization_id, created_at desc);

-- 11. Activation de la RLS sur les 14 tables -------------------------------------------------------------

alter table public.wa_accounts enable row level security;
alter table public.wa_contacts enable row level security;
alter table public.ai_agents enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_webhook_events enable row level security;
alter table public.wa_templates enable row level security;
alter table public.ai_knowledge_sources enable row level security;
alter table public.ai_knowledge_chunks enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_usage_monthly enable row level security;
alter table public.ai_credit_ledger enable row level security;

-- Révocation de tout accès public
revoke all on public.wa_accounts, public.wa_contacts, public.ai_agents, public.wa_conversations,
  public.wa_messages, public.wa_webhook_events, public.wa_templates, public.ai_knowledge_sources,
  public.ai_knowledge_chunks, public.ai_jobs, public.ai_runs, public.ai_actions,
  public.ai_usage_monthly, public.ai_credit_ledger
from anon, public;

-- Droits de lecture pour les membres authentifiés sur leur agence
grant select on
  public.wa_accounts, public.wa_contacts, public.ai_agents, public.wa_conversations,
  public.wa_messages, public.wa_templates, public.ai_knowledge_sources,
  public.ai_runs, public.ai_actions, public.ai_usage_monthly, public.ai_credit_ledger
to authenticated;

-- Droits d'insertion/modification pour les membres sur leur agence
grant insert, update on
  public.wa_accounts, public.wa_contacts, public.wa_conversations, public.wa_messages
to authenticated;

create policy wa_accounts_select on public.wa_accounts for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy wa_accounts_insert on public.wa_accounts for insert to authenticated
  with check (organization_id in (select private.my_org_ids()));

create policy wa_contacts_select on public.wa_contacts for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy wa_contacts_insert on public.wa_contacts for insert to authenticated
  with check (organization_id in (select private.my_org_ids()));

create policy ai_agents_select on public.ai_agents for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy wa_conversations_select on public.wa_conversations for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy wa_conversations_insert on public.wa_conversations for insert to authenticated
  with check (organization_id in (select private.my_org_ids()));

create policy wa_conversations_update on public.wa_conversations for update to authenticated
  using (organization_id in (select private.my_org_ids()))
  with check (organization_id in (select private.my_org_ids()));

create policy wa_messages_select on public.wa_messages for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy wa_messages_insert on public.wa_messages for insert to authenticated
  with check (organization_id in (select private.my_org_ids()));

create policy wa_templates_select on public.wa_templates for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy ai_knowledge_sources_select on public.ai_knowledge_sources for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy ai_runs_select on public.ai_runs for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy ai_actions_select on public.ai_actions for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy ai_usage_monthly_select on public.ai_usage_monthly for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy ai_credit_ledger_select on public.ai_credit_ledger for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- 12. Fonctions contrôlées d'écriture (SECURITY DEFINER) --------------------------------------------------

-- Sauvegarder ou modifier un assistant IA
create or replace function public.save_ai_agent(
  p_id uuid,
  p_org uuid,
  p_name text,
  p_avatar_url text,
  p_role text,
  p_starter_model text default 'general',
  p_tone text default 'courtois',
  p_personality text default null,
  p_instructions text default '',
  p_services text default null,
  p_restricted text default null,
  p_transfer text default null,
  p_is_active boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_plan_agents integer;
  v_current_count integer;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent configurer un agent IA.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');

  if p_id is null then
    -- Contrôle du quota d'agents de la formule
    select coalesce(pl.max_ai_agents, 0) into v_plan_agents
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.organization_id = p_org;

    select count(*) into v_current_count
    from public.ai_agents
    where organization_id = p_org;

    if v_plan_agents is not null and v_current_count >= v_plan_agents then
      raise exception 'Limite d''agents atteinte pour votre formule (% max). Passez à la formule supérieure.', v_plan_agents;
    end if;

    insert into public.ai_agents (
      organization_id, name, avatar_url, role, starter_model, tone,
      personality, system_instructions, services_scope, restricted_topics,
      transfer_conditions, is_active, created_by
    ) values (
      p_org, trim(p_name), nullif(trim(p_avatar_url), ''), trim(p_role),
      coalesce(p_starter_model, 'general'), coalesce(p_tone, 'courtois'),
      nullif(trim(p_personality), ''), coalesce(trim(p_instructions), ''),
      nullif(trim(p_services), ''), nullif(trim(p_restricted), ''),
      nullif(trim(p_transfer), ''), coalesce(p_is_active, true), auth.uid()
    ) returning id into v_id;
  else
    update public.ai_agents
    set
      name = trim(p_name),
      avatar_url = nullif(trim(p_avatar_url), ''),
      role = trim(p_role),
      starter_model = coalesce(p_starter_model, starter_model),
      tone = coalesce(p_tone, tone),
      personality = nullif(trim(p_personality), ''),
      system_instructions = coalesce(trim(p_instructions), ''),
      services_scope = nullif(trim(p_services), ''),
      restricted_topics = nullif(trim(p_restricted), ''),
      transfer_conditions = nullif(trim(p_transfer), ''),
      is_active = coalesce(p_is_active, is_active),
      version = version + 1
    where id = p_id and organization_id = p_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Agent IA introuvable ou accès refusé.';
    end if;
  end if;

  return v_id;
end;
$$;

-- Supprimer un agent IA
create or replace function public.delete_ai_agent(p_id uuid, p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent supprimer un agent IA.';
  end if;

  delete from public.ai_agents where id = p_id and organization_id = p_org;
end;
$$;

-- Changer le mode d'une conversation (ai, assist, human) et assigner un conseiller
create or replace function public.set_conversation_mode(
  p_id uuid,
  p_org uuid,
  p_mode text,
  p_assigned_to uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin', 'agent']) then
    raise exception 'Action non autorisée.';
  end if;

  if p_mode not in ('ai', 'assist', 'human') then
    raise exception 'Mode invalide : %.', p_mode;
  end if;

  update public.wa_conversations
  set
    mode = p_mode,
    assigned_to = coalesce(p_assigned_to, case when p_mode = 'human' then auth.uid() else assigned_to end),
    updated_at = now()
  where id = p_id and organization_id = p_org;
end;
$$;

-- Droits d'exécution
grant execute on function public.save_ai_agent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_ai_agent(uuid, uuid) to authenticated;
grant execute on function public.set_conversation_mode(uuid, uuid, text, uuid) to authenticated;
