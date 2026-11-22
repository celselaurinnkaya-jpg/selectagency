-- SELECT Agency — Passage direct à une étape d'un dossier (rapport de re-test du 22 novembre 2026).
--
-- Avant, seule l'étape suivante était proposée : impossible d'aller directement à « Visa refusé » ou de sauter
-- une étape inutile. Nouveau mode « jump » d'apply_case_transition : vers n'importe quelle étape plus loin, pas
-- encore terminée, avec un motif obligatoire. L'étape quittée et les étapes sautées sont marquées « passées »
-- (« Non concerné ») ; une décision garde son niveau de preuve (déclaré ou confirmé) ; la clôture garde le
-- contrôle du solde. Même signature : les droits accordés à la fonction sont conservés.

create or replace function public.apply_case_transition(
  p_case_id uuid,
  p_version integer,
  p_mode text,
  p_to text default null,
  p_confirmation text default null,
  p_evidence_ref text default null,
  p_source_note text default null,
  p_reason text default null,
  p_acknowledge_balance boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_current public.case_steps;
  v_target public.case_steps;
  v_member uuid;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_source text := nullif(trim(coalesce(p_source_note, '')), '');
  v_evidence text := nullif(trim(coalesce(p_evidence_ref, '')), '');
  v_has_next boolean;
  v_target_key text;
  v_conf text;
  v_closes boolean;
  v_event text;
  v_new_version integer;
begin
  select * into v_case from public.cases c where c.id = p_case_id for update;
  if not found or not private.has_role(v_case.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  if v_case.status <> 'active' then
    raise exception 'Ce dossier n''est pas modifiable.';
  end if;
  if v_case.version <> p_version then
    raise exception 'Ce dossier vient d''être modifié par une autre personne. Rechargez la page, puis recommencez.';
  end if;
  if p_mode is null or p_mode not in ('advance', 'skip', 'back', 'jump') then
    raise exception 'Action inconnue sur l''étape.';
  end if;

  select * into v_current from public.case_steps s
  where s.case_id = p_case_id and s.status = 'in_progress'
  order by s.position limit 1;
  if not found then
    raise exception 'Ce dossier n''a plus d''étape en cours.';
  end if;
  v_member := private.member_id(v_case.organization_id);

  if p_mode = 'jump' then
    -- Passage direct (ex. « Visa refusé » sans attendre les étapes intermédiaires) : vers n'importe quelle étape
    -- plus loin, pas encore terminée. Motif obligatoire ; les étapes sautées sont marquées « Non concerné ».
    select * into v_target from public.case_steps s
    where s.case_id = p_case_id and s.key = p_to and s.position > v_current.position and s.status in ('pending', 'skipped');
    if not found then
      raise exception 'Choisissez l''étape à atteindre.';
    end if;
    if char_length(coalesce(v_reason, '')) < 3 then
      raise exception 'Indiquez le motif du passage direct à cette étape.';
    end if;
    -- Une décision (visa accordé ou refusé…) garde son niveau de preuve.
    if v_target.kind = 'outcome' then
      if p_confirmation is null or p_confirmation not in ('declared', 'confirmed') then
        raise exception 'Indiquez si l''information est déclarée ou confirmée par un justificatif.';
      end if;
      if p_confirmation = 'declared' and char_length(coalesce(v_source, '')) < 3 then
        raise exception 'Précisez la source de l''information (par exemple : appel du client le 12/11).';
      end if;
      if p_confirmation = 'confirmed' and char_length(coalesce(v_evidence, '')) < 3 then
        raise exception 'Indiquez la référence du justificatif qui prouve cette information.';
      end if;
      v_conf := p_confirmation;
    end if;
    if v_target.kind = 'closure' and not coalesce(p_acknowledge_balance, false)
       and private.case_balance(p_case_id) > 0 then
      raise exception 'Le solde du dossier n''est pas réglé : confirmez la clôture malgré tout.';
    end if;
  elsif p_mode = 'back' then
    -- Retour : seulement vers une étape terminée ou passée, jamais vers une décision ni la clôture.
    select * into v_target from public.case_steps s
    where s.case_id = p_case_id and s.key = p_to and s.position < v_current.position
      and s.status in ('done', 'skipped') and s.kind not in ('outcome', 'closure');
    if not found then
      raise exception 'Choisissez l''étape à reprendre.';
    end if;
    if char_length(coalesce(v_reason, '')) < 3 then
      raise exception 'Indiquez le motif du retour en arrière.';
    end if;
  else
    -- Étapes suivantes autorisées : les choix prévus par l'étape, sinon l'étape qui suit dans l'ordre.
    v_has_next := jsonb_typeof(v_current.next) = 'array' and jsonb_array_length(v_current.next) > 0;
    if p_mode = 'skip' then
      if not v_current.is_optional then
        raise exception 'Seule une étape facultative peut être passée.';
      end if;
      if char_length(coalesce(v_reason, '')) < 3 then
        raise exception 'Indiquez pourquoi cette étape est passée.';
      end if;
      if v_has_next then
        select o.value ->> 'to' into v_target_key
        from jsonb_array_elements(v_current.next) with ordinality o(value, ord)
        join public.case_steps s on s.case_id = p_case_id and s.key = o.value ->> 'to'
        order by o.ord limit 1;
      elsif v_current.kind <> 'closure' then
        select s.key into v_target_key from public.case_steps s
        where s.case_id = p_case_id and s.position > v_current.position
        order by s.position limit 1;
      end if;
      if v_target_key is null then
        raise exception 'Aucune étape ne suit celle-ci.';
      end if;
    else
      if v_has_next then
        if exists (select 1 from jsonb_array_elements(v_current.next) o where o ->> 'to' = p_to) then
          v_target_key := p_to;
        end if;
      elsif v_current.kind <> 'closure' then
        select s.key into v_target_key from public.case_steps s
        where s.case_id = p_case_id and s.position > v_current.position
        order by s.position limit 1;
        if v_target_key is distinct from p_to then
          v_target_key := null;
        end if;
      end if;
      if v_target_key is null then
        raise exception 'Choisissez l''étape suivante.';
      end if;
    end if;

    select * into v_target from public.case_steps s where s.case_id = p_case_id and s.key = v_target_key;
    if not found then
      raise exception 'Choisissez l''étape suivante.';
    end if;

    -- Information venant d'un organisme extérieur, ou décision enregistrée : niveau de preuve obligatoire.
    if v_current.kind = 'external_event' or v_target.kind = 'outcome' then
      if p_mode = 'skip' then
        raise exception 'Une décision ne peut pas être enregistrée en passant une étape.';
      end if;
      if p_confirmation is null or p_confirmation not in ('declared', 'confirmed') then
        raise exception 'Indiquez si l''information est déclarée ou confirmée par un justificatif.';
      end if;
      if p_confirmation = 'declared' and char_length(coalesce(v_source, '')) < 3 then
        raise exception 'Précisez la source de l''information (par exemple : appel du client le 12/11).';
      end if;
      if p_confirmation = 'confirmed' and char_length(coalesce(v_evidence, '')) < 3 then
        raise exception 'Indiquez la référence du justificatif qui prouve cette information.';
      end if;
      v_conf := p_confirmation;
    end if;

    if v_target.kind = 'closure' and not coalesce(p_acknowledge_balance, false)
       and private.case_balance(p_case_id) > 0 then
      raise exception 'Le solde du dossier n''est pas réglé : confirmez la clôture malgré tout.';
    end if;
  end if;

  v_closes := v_target.kind = 'closure';

  -- Étapes intermédiaires.
  if v_target.position < v_current.position then
    -- Retour : on reprend les étapes entre les deux, en gardant l'historique des décisions.
    update public.case_steps s set
      status = 'pending', confirmation_level = null, evidence_ref = null, source_note = null, note = null,
      completed_at = null, completed_by = null
    where s.case_id = p_case_id and s.position > v_target.position and s.position < v_current.position
      and not (s.kind = 'outcome' and s.status = 'done');
  else
    update public.case_steps s set status = 'skipped', note = 'Non concerné'
    where s.case_id = p_case_id and s.position > v_current.position and s.position < v_target.position
      and s.status = 'pending';
  end if;

  -- Étape quittée.
  if p_mode = 'back' then
    update public.case_steps s set
      status = 'pending', confirmation_level = null, evidence_ref = null, source_note = null, note = null,
      completed_at = null, completed_by = null
    where s.id = v_current.id;
  else
    update public.case_steps s set
      status = case when p_mode in ('skip', 'jump') then 'skipped' else 'done' end,
      confirmation_level = case when v_conf is not null and p_mode <> 'jump' then v_conf else s.confirmation_level end,
      evidence_ref = case when v_conf is not null and p_mode <> 'jump' then (case when v_conf = 'confirmed' then v_evidence end) else s.evidence_ref end,
      source_note = case when v_conf is not null and p_mode <> 'jump' then (case when v_conf = 'declared' then v_source end) else s.source_note end,
      note = case when p_mode in ('skip', 'jump') then v_reason else s.note end,
      completed_at = v_now,
      completed_by = v_member
    where s.id = v_current.id;
  end if;

  -- Étape atteinte.
  update public.case_steps s set
    status = case when v_closes then 'done' else 'in_progress' end,
    confirmation_level = case when s.kind = 'outcome' then v_conf end,
    evidence_ref = case when s.kind = 'outcome' and v_conf = 'confirmed' then v_evidence end,
    source_note = case when s.kind = 'outcome' and v_conf = 'declared' then v_source end,
    note = null,
    completed_at = case when v_closes or s.kind = 'outcome' then v_now end,
    completed_by = case when v_closes or s.kind = 'outcome' then v_member end
  where s.id = v_target.id;

  update public.cases c set
    status = case when v_closes then 'closed' else c.status end,
    closed_at = case when v_closes then v_now else c.closed_at end,
    next_action = case when v_closes then null else v_target.label end,
    next_action_due_at = case when v_closes then null else c.next_action_due_at end,
    outcome = case when v_target.kind = 'outcome' then coalesce(v_target.outcome, c.outcome) else c.outcome end,
    version = c.version + 1
  where c.id = p_case_id
  returning c.version into v_new_version;

  -- Historique (même texte que l'application).
  if p_mode = 'back' then
    v_event := format('Retour à l''étape « %s ». Motif : %s', v_target.label, v_reason);
  elsif p_mode = 'skip' then
    v_event := format('Étape « %s » passée. Motif : %s', v_current.label, v_reason);
  elsif p_mode = 'jump' then
    v_event := format('Passage direct de « %s » à « %s ». Motif : %s', v_current.label, v_target.label, v_reason);
    if v_conf = 'confirmed' then
      v_event := v_event || format(' (confirmé, justificatif au dossier : %s)', v_evidence);
    elsif v_conf = 'declared' then
      v_event := v_event || format(' (déclaré, non vérifié ; source : %s)', v_source);
    end if;
    if v_closes then
      v_event := v_event || '. Dossier clôturé.';
    end if;
  else
    v_event := format('Étape « %s » terminée', v_current.label);
    if v_conf = 'confirmed' then
      v_event := v_event || format(' (confirmé, justificatif au dossier : %s)', v_evidence);
    elsif v_conf = 'declared' then
      v_event := v_event || format(' (déclaré, non vérifié ; source : %s)', v_source);
    end if;
    v_event := v_event || case when v_closes then '. Dossier clôturé.' else format('. Étape en cours : « %s ».', v_target.label) end;
  end if;
  insert into public.activity_events (organization_id, actor_id, client_id, case_id, text)
  values (v_case.organization_id, v_member, v_case.client_id, v_case.id, v_event);

  return jsonb_build_object(
    'version', v_new_version,
    'closes', v_closes,
    'to_label', v_target.label,
    'outcome', case when v_target.kind = 'outcome' then v_target.outcome end
  );
end;
$$;
