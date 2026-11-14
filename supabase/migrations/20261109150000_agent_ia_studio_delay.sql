-- =====================================================================================
-- Migration Phase 8 Studio : Paramètres de réactivité et délai de réponse de l'Agent IA
-- =====================================================================================

alter table public.ai_agents
  add column if not exists response_delay_seconds integer not null default 15,
  add column if not exists facebook_url text check (facebook_url is null or char_length(facebook_url) <= 300),
  add column if not exists catalog_url text check (catalog_url is null or char_length(catalog_url) <= 300);

-- Supprimer l'ancienne signature pour éviter l'ambiguïté des paramètres par défaut
drop function if exists public.save_ai_agent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean);

-- Fonction save_ai_agent étendue avec délai de réponse et liens boutique / Facebook
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
  p_is_active boolean default true,
  p_delay integer default 15,
  p_facebook_url text default null,
  p_catalog_url text default null
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
      transfer_conditions, is_active, response_delay_seconds, facebook_url,
      catalog_url, created_by
    ) values (
      p_org, trim(p_name), nullif(trim(p_avatar_url), ''), trim(p_role),
      coalesce(p_starter_model, 'general'), coalesce(p_tone, 'courtois'),
      nullif(trim(p_personality), ''), coalesce(trim(p_instructions), ''),
      nullif(trim(p_services), ''), nullif(trim(p_restricted), ''),
      nullif(trim(p_transfer), ''), coalesce(p_is_active, true),
      coalesce(p_delay, 15), nullif(trim(p_facebook_url), ''),
      nullif(trim(p_catalog_url), ''), auth.uid()
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
      response_delay_seconds = coalesce(p_delay, response_delay_seconds),
      facebook_url = nullif(trim(p_facebook_url), facebook_url),
      catalog_url = nullif(trim(p_catalog_url), catalog_url),
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

grant execute on function public.save_ai_agent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, integer, text, text) to authenticated;
