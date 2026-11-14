-- =====================================================================================
-- Migration Phase 4 : Base de connaissances et RAG de l'Agent IA
-- Sources (textes, fichiers, liens), découpage en fragments (chunks) et recherche
-- =====================================================================================

-- 1. Droits et RLS sur ai_knowledge_chunks ---------------------------------------------

grant select on public.ai_knowledge_chunks to authenticated;

drop policy if exists ai_knowledge_chunks_select on public.ai_knowledge_chunks;
create policy ai_knowledge_chunks_select on public.ai_knowledge_chunks for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- 2. Index de recherche plein-texte sur les fragments ---------------------------------

create index if not exists ai_knowledge_chunks_fts_idx on public.ai_knowledge_chunks
  using gin (to_tsvector('french', content));

-- 3. Fonction pour ajouter ou modifier une source de connaissances --------------------

create or replace function public.save_ai_knowledge_source(
  p_id uuid,
  p_org uuid,
  p_agent_id uuid,
  p_kind text,
  p_title text,
  p_raw_content text default null,
  p_source_url text default null,
  p_storage_path text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_agent_exists boolean;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent gérer la base de connaissances.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');

  if p_kind not in ('file', 'text', 'url') then
    raise exception 'Type de source invalide : %.', p_kind;
  end if;

  select exists(
    select 1 from public.ai_agents
    where id = p_agent_id and organization_id = p_org
  ) into v_agent_exists;

  if not v_agent_exists then
    raise exception 'Agent IA introuvable ou non rattaché à cette agence.';
  end if;

  if p_id is null then
    insert into public.ai_knowledge_sources (
      organization_id, agent_id, kind, title,
      raw_content, source_url, storage_path, status, chunks_count
    ) values (
      p_org, p_agent_id, p_kind, trim(p_title),
      nullif(trim(p_raw_content), ''), nullif(trim(p_source_url), ''),
      nullif(trim(p_storage_path), ''), 'pending', 0
    ) returning id into v_id;
  else
    update public.ai_knowledge_sources
    set
      agent_id = p_agent_id,
      kind = p_kind,
      title = trim(p_title),
      raw_content = nullif(trim(p_raw_content), ''),
      source_url = nullif(trim(p_source_url), ''),
      storage_path = nullif(trim(p_storage_path), ''),
      status = 'pending',
      updated_at = now()
    where id = p_id and organization_id = p_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Source de connaissances introuvable ou accès refusé.';
    end if;
  end if;

  return v_id;
end;
$$;

-- 4. Fonction pour synchroniser les fragments indexés (chunks) ------------------------

create or replace function public.save_ai_knowledge_chunks(
  p_org uuid,
  p_source_id uuid,
  p_agent_id uuid,
  p_chunks text[]
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  i integer;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Action non autorisée.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');

  -- Suppression des anciens fragments de cette source
  delete from public.ai_knowledge_chunks
  where source_id = p_source_id and organization_id = p_org;

  v_count := coalesce(array_length(p_chunks, 1), 0);

  if v_count > 0 then
    for i in 1..v_count loop
      insert into public.ai_knowledge_chunks (
        organization_id, source_id, agent_id, content, chunk_index
      ) values (
        p_org, p_source_id, p_agent_id, p_chunks[i], i - 1
      );
    end loop;
  end if;

  -- Mise à jour de la source parente
  update public.ai_knowledge_sources
  set
    chunks_count = v_count,
    status = case when v_count > 0 then 'ready' else 'pending' end,
    error_message = null,
    updated_at = now()
  where id = p_source_id and organization_id = p_org;

  return v_count;
end;
$$;

-- 5. Fonction pour supprimer une source de connaissances ------------------------------

create or replace function public.delete_ai_knowledge_source(
  p_id uuid,
  p_org uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent supprimer une source de connaissances.';
  end if;

  delete from public.ai_knowledge_sources
  where id = p_id and organization_id = p_org;
end;
$$;

-- 6. Fonction de recherche dans les connaissances d'un agent (RAG) ---------------------

create or replace function public.search_ai_knowledge(
  p_org uuid,
  p_agent_id uuid,
  p_query text,
  p_limit integer default 4
) returns table (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  content text,
  rank real
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_trimmed text;
  v_tsquery tsquery;
begin
  v_trimmed := trim(coalesce(p_query, ''));
  if v_trimmed = '' then
    return;
  end if;

  -- Tentative de conversion en tsquery français
  begin
    v_tsquery := plainto_tsquery('french', v_trimmed);
  exception when others then
    v_tsquery := null;
  end;

  if v_tsquery is not null and v_tsquery::text <> '' then
    return query
    select
      c.id as chunk_id,
      s.id as source_id,
      s.title as source_title,
      c.content,
      ts_rank(to_tsvector('french', c.content), v_tsquery) as rank
    from public.ai_knowledge_chunks c
    join public.ai_knowledge_sources s on s.id = c.source_id
    where c.organization_id = p_org
      and c.agent_id = p_agent_id
      and s.status = 'ready'
      and to_tsvector('french', c.content) @@ v_tsquery
    order by rank desc, c.created_at asc
    limit p_limit;
  end if;

  -- Si aucun résultat plein-texte ou requête trop courte : recherche par sous-chaîne ILIKE
  if not found then
    return query
    select
      c.id as chunk_id,
      s.id as source_id,
      s.title as source_title,
      c.content,
      0.5::real as rank
    from public.ai_knowledge_chunks c
    join public.ai_knowledge_sources s on s.id = c.source_id
    where c.organization_id = p_org
      and c.agent_id = p_agent_id
      and s.status = 'ready'
      and c.content ilike '%' || v_trimmed || '%'
    order by c.chunk_index asc
    limit p_limit;
  end if;
end;
$$;

-- 7. Droits d'exécution ----------------------------------------------------------------

grant execute on function public.save_ai_knowledge_source(uuid, uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.save_ai_knowledge_chunks(uuid, uuid, uuid, text[]) to authenticated;
grant execute on function public.delete_ai_knowledge_source(uuid, uuid) to authenticated;
grant execute on function public.search_ai_knowledge(uuid, uuid, text, integer) to authenticated;

