-- Sécurité S2 : la liste des pièces ne change QUE par les fonctions contrôlées.
--
-- Constat (audit du 3 novembre 2026, confirmé sur le projet de test) : par l'API, un membre pouvait marquer une
-- pièce « vérifiée » alors qu'aucun fichier n'avait été reçu, ou ajouter une pièce directement déjà « vérifiée ».
-- Les fonctions de dépôt, de retrait et de modification étaient déjà contrôlées (31 octobre) ; restaient la
-- vérification (review_requirement, qui comptait sur les droits d'écriture directe) et l'ajout d'une pièce.
--
-- Désormais :
-- 1. review_requirement (SECURITY DEFINER) : propriétaire, administrateur ou conseiller, dossier actif, pièce en
--    attente de vérification AVEC au moins un fichier, motif obligatoire pour « à corriger ». Le texte de
--    l'historique est écrit par la base (celui envoyé par le navigateur est ignoré).
-- 2. add_requirement : ajout d'une pièce à la liste (toujours « non reçue »), doublons refusés, historique écrit
--    par la base.
-- 3. Plus aucune écriture directe dans la liste des pièces.

-- 1. Vérification d'une pièce par l'agence -------------------------------------------------------------

create or replace function public.review_requirement(p_requirement_id uuid, p_decision text, p_comment text, p_event text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.document_requirements;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if p_decision is null or p_decision not in ('validated', 'to_correct') then
    raise exception 'Décision inconnue.';
  end if;
  -- Rôle (propriétaire, administrateur, conseiller) et dossier actif.
  v_req := private.editable_requirement(p_requirement_id);
  if v_req.status not in ('received', 'to_verify') then
    raise exception 'Cette pièce n''est pas en attente de vérification.';
  end if;
  if v_req.storage_path is null and not exists (
    select 1 from public.document_files f where f.requirement_id = v_req.id
  ) then
    raise exception 'Aucun fichier n''a été reçu pour cette pièce : elle ne peut pas être vérifiée.';
  end if;
  if p_decision = 'to_correct' and char_length(coalesce(v_comment, '')) < 3 then
    raise exception 'Indiquez ce qu''il faut corriger.';
  end if;

  update public.document_requirements r set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = private.member_id(v_req.organization_id),
    review_comment = case when p_decision = 'to_correct' then left(v_comment, 500) end
  where r.id = v_req.id;

  perform private.log_requirement_event(
    v_req,
    case when p_decision = 'validated'
      then format('Pièce vérifiée par l''agence : %s.', v_req.label)
      else format('Pièce à corriger : %s (%s).', v_req.label, left(v_comment, 300))
    end
  );
end;
$$;

-- 2. Ajout d'une pièce à la liste du dossier -----------------------------------------------------------

create function public.add_requirement(
  p_case_id uuid,
  p_document_type_code text,
  p_label text,
  p_category text,
  p_is_required boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_label text := left(trim(coalesce(p_label, '')), 160);
  v_code text := left(trim(coalesce(p_document_type_code, '')), 60);
  v_id uuid;
begin
  select * into v_case from public.cases c where c.id = p_case_id;
  if not found or not private.has_role(v_case.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit de modifier sa liste de pièces.';
  end if;
  if v_case.status <> 'active' then
    raise exception 'Ce dossier n''est plus actif : sa liste de pièces n''est pas modifiable.';
  end if;
  if char_length(v_label) < 2 or v_code = '' then
    raise exception 'Indiquez le nom de la pièce.';
  end if;
  if exists (
    select 1 from public.document_requirements r
    where r.case_id = v_case.id and (r.document_type_code = v_code or lower(trim(r.label)) = lower(v_label))
  ) then
    raise exception 'Cette pièce figure déjà dans la liste du dossier.';
  end if;

  insert into public.document_requirements (organization_id, case_id, document_type_code, label, category, is_required, status)
  values (v_case.organization_id, v_case.id, v_code, v_label, left(trim(coalesce(p_category, '')), 60), coalesce(p_is_required, true), 'not_received')
  returning id into v_id;

  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_case.organization_id, private.member_id(v_case.organization_id), v_case.client_id, v_case.id,
          format('Pièce ajoutée à la liste du dossier : %s.', v_label));
  return v_id;
end;
$$;

-- 3. Plus d'écriture directe dans la liste des pièces -------------------------------------------------

drop policy if exists document_requirements_insert on public.document_requirements;
drop policy if exists document_requirements_update on public.document_requirements;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function public.review_requirement(uuid, text, text, text) from public, anon;
grant execute on function public.review_requirement(uuid, text, text, text) to authenticated;
revoke all on function public.add_requirement(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.add_requirement(uuid, text, text, text, boolean) to authenticated;
