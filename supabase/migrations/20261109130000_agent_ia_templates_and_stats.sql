-- =====================================================================================
-- Migration Phase 7 & 8 : Modèles WhatsApp Meta et Statistiques de consommation
-- =====================================================================================

-- 1. Droits et RLS sur public.wa_templates ---------------------------------------------

grant select on public.wa_templates to authenticated;

drop policy if exists wa_templates_select on public.wa_templates;
create policy wa_templates_select on public.wa_templates for select to authenticated
  using (organization_id in (select private.my_org_ids()));

-- 2. Fonction pour enregistrer ou mettre à jour un modèle WhatsApp Meta -----------------

create or replace function public.save_wa_template(
  p_id uuid,
  p_org uuid,
  p_name text,
  p_language text default 'fr',
  p_category text default 'UTILITY',
  p_body_text text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_clean_name text;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent configurer des modèles WhatsApp.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');

  v_clean_name := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9_]', '_', 'g'));
  if char_length(v_clean_name) < 2 then
    raise exception 'Le nom technique du modèle doit comporter au moins 2 caractères.';
  end if;

  if p_category not in ('UTILITY', 'MARKETING', 'AUTHENTICATION') then
    raise exception 'Catégorie de modèle invalide : %.', p_category;
  end if;

  if p_id is null then
    insert into public.wa_templates (
      organization_id, name, language, category, body_text, status
    ) values (
      p_org, v_clean_name, coalesce(nullif(trim(p_language), ''), 'fr'),
      p_category, trim(p_body_text), 'approved'
    ) returning id into v_id;
  else
    update public.wa_templates
    set
      name = v_clean_name,
      language = coalesce(nullif(trim(p_language), ''), language),
      category = p_category,
      body_text = trim(p_body_text),
      updated_at = now()
    where id = p_id and organization_id = p_org
    returning id into v_id;

    if v_id is null then
      raise exception 'Modèle introuvable ou accès refusé.';
    end if;
  end if;

  return v_id;
end;
$$;

-- 3. Fonction pour supprimer un modèle WhatsApp ---------------------------------------

create or replace function public.delete_wa_template(
  p_id uuid,
  p_org uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Action réservée aux administrateurs.';
  end if;

  delete from public.wa_templates where id = p_id and organization_id = p_org;
end;
$$;

-- 4. Droits d'exécution ----------------------------------------------------------------

grant execute on function public.save_wa_template(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.delete_wa_template(uuid, uuid) to authenticated;

