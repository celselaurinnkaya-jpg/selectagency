-- Agent IA : Studio fiable, réponse automatique avec délai, conversations en temps réel, accès resserrés.
--
-- 1. Enregistrement de l'agent : le modèle choisi (Haiku ou Sonnet) est gardé ; une adresse Facebook ou de
--    boutique n'est plus effacée quand on enregistre deux fois (erreur « nullif ») ; délai de 0 à 120 s.
--    Pendant l'essai (et pour la démonstration), l'agence a les quotas de la formule PRO, comme elle a déjà
--    toutes les options (private.org_has_feature).
-- 2. Connaissances : la recherche ne lit que les connaissances de sa propre agence (avant : aucune vérification) ;
--    les mots du message sont cherchés séparément (avant : tous les mots devaient être dans le même passage) ;
--    un fragment ne peut viser qu'une source de son agence.
-- 3. « Lu » : seuls les membres de l'agence peuvent remettre à zéro le compteur d'une conversation.
-- 4. Réponse automatique : le serveur de SELECT (secret) lit le contexte d'une conversation et enregistre la
--    réponse de l'IA. Rien n'est envoyé si un conseiller a repris la main, si le client a écrit un message plus
--    récent, si le quota du mois est atteint ou si l'abonnement ne permet pas d'écrire.
-- 5. Temps réel : les nouvelles conversations et les nouveaux messages arrivent à l'écran sans recharger
--    (lecture toujours filtrée par les règles d'accès de l'agence).

-- 1. Enregistrement de l'agent -----------------------------------------------------------------------------

alter table public.ai_agents
  add constraint ai_agents_delay_range check (response_delay_seconds between 0 and 120) not valid,
  add constraint ai_agents_instructions_length check (char_length(system_instructions) <= 12000) not valid;

/** Quotas Agent IA de l'agence : ceux de sa formule, ou ceux de PRO pendant l'essai et la démonstration. */
create function private.ai_limits(p_org uuid, out max_agents integer, out monthly_replies integer)
language sql stable security definer set search_path = '' as $$
  select
    case when o.is_demo or s.organization_id is null or s.status = 'trialing'
      then greatest(coalesce(pl.max_ai_agents, 0), coalesce(pro.max_agents, 0)) else coalesce(pl.max_ai_agents, 0) end,
    case when o.is_demo or s.organization_id is null or s.status = 'trialing'
      then greatest(coalesce(pl.monthly_ai_replies, 0), coalesce(pro.replies, 0)) else coalesce(pl.monthly_ai_replies, 0) end
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans pl on pl.id = s.plan_id
  cross join (select max(p.max_ai_agents) as max_agents, max(p.monthly_ai_replies) as replies from public.plans p where p.tier = 'pro') pro
  where o.id = p_org;
$$;
revoke all on function private.ai_limits(uuid) from public, anon, authenticated;

drop function if exists public.save_ai_agent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, integer, text, text);

create function public.save_ai_agent(
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
  p_catalog_url text default null,
  p_model_tier text default 'haiku'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_max integer;
  v_count integer;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent configurer un agent IA.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');
  if coalesce(p_delay, 15) not between 0 and 120 then
    raise exception 'Le délai de réponse va de 0 à 120 secondes.';
  end if;
  if p_model_tier is not null and p_model_tier not in ('haiku', 'sonnet') then
    raise exception 'Modèle d''IA inconnu.';
  end if;

  if p_id is null then
    select l.max_agents into v_max from private.ai_limits(p_org) l;
    select count(*) into v_count from public.ai_agents where organization_id = p_org;
    if v_count >= coalesce(v_max, 0) then
      raise exception 'Limite d''agents atteinte pour votre formule (% max). Passez à la formule supérieure.', coalesce(v_max, 0);
    end if;

    insert into public.ai_agents (
      organization_id, name, avatar_url, role, starter_model, tone, personality, system_instructions, services_scope,
      restricted_topics, transfer_conditions, is_active, response_delay_seconds, facebook_url, catalog_url, model_tier, created_by
    ) values (
      p_org, trim(p_name), nullif(trim(p_avatar_url), ''), trim(p_role), coalesce(p_starter_model, 'general'),
      coalesce(p_tone, 'courtois'), nullif(trim(p_personality), ''), coalesce(trim(p_instructions), ''),
      nullif(trim(p_services), ''), nullif(trim(p_restricted), ''), nullif(trim(p_transfer), ''), coalesce(p_is_active, true),
      coalesce(p_delay, 15), nullif(trim(p_facebook_url), ''), nullif(trim(p_catalog_url), ''), coalesce(p_model_tier, 'haiku'), auth.uid()
    ) returning id into v_id;
  else
    -- Champ absent (null) : valeur gardée ; champ vidé ('') : valeur effacée.
    update public.ai_agents set
      name = trim(p_name),
      avatar_url = case when p_avatar_url is null then avatar_url else nullif(trim(p_avatar_url), '') end,
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
      facebook_url = case when p_facebook_url is null then facebook_url else nullif(trim(p_facebook_url), '') end,
      catalog_url = case when p_catalog_url is null then catalog_url else nullif(trim(p_catalog_url), '') end,
      model_tier = coalesce(p_model_tier, model_tier),
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

revoke all on function public.save_ai_agent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, integer, text, text, text) from public, anon;
grant execute on function public.save_ai_agent(uuid, uuid, text, text, text, text, text, text, text, text, text, text, boolean, integer, text, text, text) to authenticated;

-- 2. Connaissances -----------------------------------------------------------------------------------------

/** Recherche dans les connaissances d'un agent (sans contrôle d'accès : appelée par les fonctions qui l'ont fait). */
create function private.search_knowledge(p_org uuid, p_agent_id uuid, p_query text, p_limit integer default 4)
returns table (chunk_id uuid, source_id uuid, source_title text, content text, rank real)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_trimmed text := left(trim(coalesce(p_query, '')), 1000);
  v_words text;
  v_tsquery tsquery;
begin
  if v_trimmed = '' then
    return;
  end if;
  -- Chaque mot compte séparément (« ou ») : le passage le plus proche du message arrive en premier.
  v_words := plainto_tsquery('french', v_trimmed)::text;
  if v_words <> '' then
    v_tsquery := replace(v_words, ' & ', ' | ')::tsquery;
    return query
    select c.id, s.id, s.title, c.content, ts_rank(to_tsvector('french', c.content), v_tsquery)
    from public.ai_knowledge_chunks c
    join public.ai_knowledge_sources s on s.id = c.source_id
    where c.organization_id = p_org and c.agent_id = p_agent_id and s.organization_id = p_org and s.status = 'ready'
      and to_tsvector('french', c.content) @@ v_tsquery
    order by 5 desc, c.chunk_index asc
    limit greatest(1, least(coalesce(p_limit, 4), 10));
  end if;
  if not found then
    return query
    select c.id, s.id, s.title, c.content, 0.5::real
    from public.ai_knowledge_chunks c
    join public.ai_knowledge_sources s on s.id = c.source_id
    where c.organization_id = p_org and c.agent_id = p_agent_id and s.organization_id = p_org and s.status = 'ready'
      and c.content ilike '%' || v_trimmed || '%'
    order by c.chunk_index asc
    limit greatest(1, least(coalesce(p_limit, 4), 10));
  end if;
end;
$$;
revoke all on function private.search_knowledge(uuid, uuid, text, integer) from public, anon, authenticated;

create or replace function public.search_ai_knowledge(p_org uuid, p_agent_id uuid, p_query text, p_limit integer default 4)
returns table (chunk_id uuid, source_id uuid, source_title text, content text, rank real)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.my_org_ids() o where o = p_org) then
    return;
  end if;
  return query select * from private.search_knowledge(p_org, p_agent_id, p_query, p_limit);
end;
$$;
revoke all on function public.search_ai_knowledge(uuid, uuid, text, integer) from public, anon;
grant execute on function public.search_ai_knowledge(uuid, uuid, text, integer) to authenticated;

create or replace function public.save_ai_knowledge_chunks(
  p_org uuid,
  p_source_id uuid,
  p_agent_id uuid,
  p_chunks text[]
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := coalesce(array_length(p_chunks, 1), 0);
  i integer;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Action non autorisée.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');
  if not exists (
    select 1 from public.ai_knowledge_sources s where s.id = p_source_id and s.organization_id = p_org and s.agent_id = p_agent_id
  ) then
    raise exception 'Source de connaissances introuvable dans cette agence.';
  end if;
  if v_count > 500 then
    raise exception 'Document trop long : 500 passages au plus.';
  end if;

  delete from public.ai_knowledge_chunks where source_id = p_source_id and organization_id = p_org;
  for i in 1..v_count loop
    insert into public.ai_knowledge_chunks (organization_id, source_id, agent_id, content, chunk_index)
    values (p_org, p_source_id, p_agent_id, p_chunks[i], i - 1);
  end loop;

  update public.ai_knowledge_sources set
    chunks_count = v_count,
    status = case when v_count > 0 then 'ready' else 'pending' end,
    error_message = null,
    updated_at = now()
  where id = p_source_id and organization_id = p_org;
  return v_count;
end;
$$;

-- 3. « Lu » ------------------------------------------------------------------------------------------------

create or replace function public.mark_wa_conversation_read(p_conv_id uuid, p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin', 'agent']) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  update public.wa_conversations set unread_count = 0, updated_at = now()
  where id = p_conv_id and organization_id = p_org;
end;
$$;
revoke all on function public.mark_wa_conversation_read(uuid, uuid) from public, anon;
grant execute on function public.mark_wa_conversation_read(uuid, uuid) to authenticated;

-- 4. Réponse automatique ------------------------------------------------------------------------------------

/**
 * Contexte de la réponse automatique à un message entrant (serveur de SELECT uniquement).
 * Renvoie {reply: false, reason} quand l'IA doit se taire : conversation reprise par un conseiller, message plus
 * récent du client (c'est lui qui sera traité), réponse déjà donnée, pas d'agent actif, quota du mois atteint,
 * abonnement qui ne permet pas d'écrire, numéro déconnecté.
 */
create function public.ai_reply_context(p_secret text, p_conversation_id uuid, p_trigger_meta_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv record;
  v_agent public.ai_agents%rowtype;
  v_trigger record;
  v_used integer;
  v_limit integer;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;

  select c.id, c.organization_id, c.mode, c.agent_id, a.phone_number_id, a.status as account_status, ct.wa_id, o.name as agency_name
    into v_conv
  from public.wa_conversations c
  join public.wa_accounts a on a.id = c.account_id
  join public.wa_contacts ct on ct.id = c.contact_id
  join public.organizations o on o.id = c.organization_id
  where c.id = p_conversation_id;
  if not found then
    return jsonb_build_object('reply', false, 'reason', 'conversation');
  end if;
  if v_conv.mode <> 'ai' then
    return jsonb_build_object('reply', false, 'reason', 'mode');
  end if;
  if v_conv.account_status <> 'connected' then
    return jsonb_build_object('reply', false, 'reason', 'account');
  end if;
  if not private.org_has_feature(v_conv.organization_id, 'ai_agent') or not private.org_can_write(v_conv.organization_id) then
    return jsonb_build_object('reply', false, 'reason', 'subscription');
  end if;

  -- Le message déclencheur doit être le dernier message du client, et rester sans réponse.
  select m.meta_message_id, m.created_at, m.body into v_trigger
  from public.wa_messages m
  where m.conversation_id = v_conv.id and m.direction = 'inbound'
  order by m.created_at desc, m.id desc
  limit 1;
  if v_trigger.meta_message_id is distinct from p_trigger_meta_id then
    return jsonb_build_object('reply', false, 'reason', 'newer');
  end if;
  if exists (select 1 from public.wa_messages m where m.conversation_id = v_conv.id and m.direction = 'outbound' and m.created_at >= v_trigger.created_at) then
    return jsonb_build_object('reply', false, 'reason', 'answered');
  end if;

  select * into v_agent from public.ai_agents ag
  where ag.organization_id = v_conv.organization_id and ag.is_active
  order by (ag.id = v_conv.agent_id) desc, ag.created_at asc
  limit 1;
  if not found then
    return jsonb_build_object('reply', false, 'reason', 'agent');
  end if;

  select l.monthly_replies into v_limit from private.ai_limits(v_conv.organization_id) l;
  select coalesce(u.ai_replies_count, 0) into v_used
  from public.ai_usage_monthly u
  where u.organization_id = v_conv.organization_id and u.period_month = date_trunc('month', now())::date;
  if coalesce(v_used, 0) >= coalesce(v_limit, 0) then
    return jsonb_build_object('reply', false, 'reason', 'quota');
  end if;

  return jsonb_build_object(
    'reply', true,
    'organization_id', v_conv.organization_id,
    'agency_name', v_conv.agency_name,
    'phone_number_id', v_conv.phone_number_id,
    'to', v_conv.wa_id,
    'agent', jsonb_build_object(
      'id', v_agent.id, 'name', v_agent.name, 'role', v_agent.role, 'tone', v_agent.tone, 'personality', v_agent.personality,
      'system_instructions', v_agent.system_instructions, 'services_scope', v_agent.services_scope,
      'restricted_topics', v_agent.restricted_topics, 'transfer_conditions', v_agent.transfer_conditions,
      'model_tier', v_agent.model_tier, 'response_delay_seconds', v_agent.response_delay_seconds
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('direction', h.direction, 'body', h.body) order by h.created_at, h.id)
      from (
        select m.direction, m.body, m.created_at, m.id from public.wa_messages m
        where m.conversation_id = v_conv.id and m.status <> 'failed' and coalesce(m.body, '') <> ''
        order by m.created_at desc, m.id desc
        limit 20
      ) h
    ), '[]'::jsonb),
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object('source_title', k.source_title, 'content', k.content))
      from private.search_knowledge(v_conv.organization_id, v_agent.id, v_trigger.body, 4) k
    ), '[]'::jsonb)
  );
end;
$$;

/** Enregistre la réponse envoyée par l'IA (identifiant de Meta), le passage à un conseiller et la consommation. */
create function public.record_ai_reply(
  p_secret text,
  p_conversation_id uuid,
  p_agent_id uuid,
  p_body text,
  p_meta_message_id text,
  p_model text,
  p_tokens_prompt integer,
  p_tokens_completion integer,
  p_cost_usd numeric,
  p_duration_ms integer,
  p_transfer boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_message_id uuid;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  select c.organization_id into v_org from public.wa_conversations c where c.id = p_conversation_id;
  if v_org is null then
    raise exception 'Conversation introuvable.';
  end if;

  insert into public.wa_messages (organization_id, conversation_id, direction, meta_message_id, kind, body, author_kind, status)
  values (v_org, p_conversation_id, 'outbound', p_meta_message_id, 'text', left(coalesce(p_body, ''), 4096), 'ai',
    case when p_meta_message_id is null then 'failed' else 'sent' end)
  returning id into v_message_id;

  update public.wa_conversations set
    last_message_text = left(coalesce(p_body, ''), 4096),
    last_message_at = now(),
    agent_id = coalesce(agent_id, p_agent_id),
    -- L'IA demande un conseiller : elle se tait et la conversation attend un humain.
    mode = case when p_transfer then 'human' else mode end,
    status = case when p_transfer then 'pending' else status end,
    updated_at = now()
  where id = p_conversation_id;

  insert into public.ai_runs (organization_id, agent_id, conversation_id, kind, model, tokens_prompt, tokens_completion, duration_ms, status, error_message)
  values (v_org, p_agent_id, p_conversation_id, 'reply', left(coalesce(p_model, ''), 80), greatest(coalesce(p_tokens_prompt, 0), 0),
    greatest(coalesce(p_tokens_completion, 0), 0), greatest(coalesce(p_duration_ms, 0), 0),
    case when p_meta_message_id is null then 'error' else 'success' end,
    case when p_meta_message_id is null then 'Meta n''a pas accepté le message.' end);

  if p_meta_message_id is not null then
    insert into public.ai_usage_monthly (organization_id, period_month, outbound_count, ai_replies_count, tokens_total, estimated_ai_cost_usd)
    values (v_org, date_trunc('month', now())::date, 1, 1, greatest(coalesce(p_tokens_prompt, 0), 0) + greatest(coalesce(p_tokens_completion, 0), 0),
      greatest(coalesce(p_cost_usd, 0), 0))
    on conflict (organization_id, period_month) do update set
      outbound_count = public.ai_usage_monthly.outbound_count + 1,
      ai_replies_count = public.ai_usage_monthly.ai_replies_count + 1,
      tokens_total = public.ai_usage_monthly.tokens_total + excluded.tokens_total,
      estimated_ai_cost_usd = public.ai_usage_monthly.estimated_ai_cost_usd + excluded.estimated_ai_cost_usd,
      updated_at = now();
  end if;
  return v_message_id;
end;
$$;

revoke all on function public.ai_reply_context(text, uuid, text) from public;
revoke all on function public.record_ai_reply(text, uuid, uuid, text, text, text, integer, integer, numeric, integer, boolean) from public;
grant execute on function public.ai_reply_context(text, uuid, text) to anon, authenticated;
grant execute on function public.record_ai_reply(text, uuid, uuid, text, text, text, integer, integer, numeric, integer, boolean) to anon, authenticated;

-- 5. Temps réel ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_messages') then
      execute 'alter publication supabase_realtime add table public.wa_messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_conversations') then
      execute 'alter publication supabase_realtime add table public.wa_conversations';
    end if;
  end if;
end;
$$;
