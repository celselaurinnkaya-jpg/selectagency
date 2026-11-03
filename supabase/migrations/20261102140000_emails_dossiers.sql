-- E-mails liés aux dossiers (étape 4c de l'intégration Brevo).
--
-- 1. Avancement du dossier (automatique, seulement si l'agence l'a activé) : un e-mail au client quand le
--    dossier attend une action de SA part, quand une décision est enregistrée (visa accordé, refusé…) et à la
--    clôture. Les étapes internes de l'agence n'envoient rien. Le contenu vient de la base, jamais de l'appelant.
-- 2. Relance des pièces manquantes (demandée par un membre) : la liste envoyée est celle de la base, au moment
--    de la demande ; le client désinscrit n'est jamais relancé.
-- 3. Revérification avant l'envoi : un e-mail d'avancement dépassé (le dossier a encore changé) ou une relance
--    d'un dossier qui n'est plus en cours est annulé.
-- 4. queue_agency_email ne sert plus qu'à l'envoi d'un document : les relances et l'avancement ont leurs
--    fonctions, qui construisent elles-mêmes le contenu.

-- 1. Avancement du dossier ------------------------------------------------------------------------------

create function private.enqueue_case_status_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.email_settings;
  v_client public.clients;
  v_step public.case_steps;
  v_org_name text;
  v_event text;
  v_status_label text;
  v_subject text;
begin
  if private.importing() then
    return null;
  end if;

  -- Désactivé tant que l'agence ne l'a pas activé (absence de réglage = désactivé).
  select * into v_settings from public.email_settings s where s.organization_id = new.organization_id;
  if not found or not v_settings.notify_case_status then
    return null;
  end if;

  select * into v_client from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id;
  if not found or coalesce(trim(v_client.email), '') = '' or v_client.email_opt_out then
    return null;
  end if;

  if new.status = 'closed' and old.status is distinct from 'closed' then
    v_event := 'closure';
    v_status_label := 'Dossier clôturé';
    select * into v_step from public.case_steps s
    where s.case_id = new.id and s.kind = 'closure'
    order by s.position desc limit 1;
  elsif new.status = 'active' then
    select * into v_step from public.case_steps s
    where s.case_id = new.id and s.status = 'in_progress'
    order by s.position limit 1;
    if not found then
      return null;
    end if;
    if v_step.kind = 'client_action' then
      v_event := 'client_action';
      v_status_label := 'Action attendue de votre part';
    elsif v_step.kind = 'outcome' and coalesce(v_step.outcome, 'pending') <> 'pending' then
      v_event := 'decision';
      v_status_label := v_step.label;
    else
      -- Étape interne (travail de l'agence, attente d'un organisme) : rien à dire au client.
      return null;
    end if;
  else
    return null;
  end if;

  select o.name into v_org_name from public.organizations o where o.id = new.organization_id;
  v_subject := case v_event
    when 'client_action' then format('Action attendue pour votre dossier %s — %s', new.reference, v_org_name)
    else format('Mise à jour de votre dossier %s — %s', new.reference, v_org_name)
  end;

  perform private.enqueue_email(
    new.organization_id,
    'case_status_changed',
    -- Une seule information par changement d'étape (la version augmente à chaque changement).
    'case_status:' || new.id::text || ':v' || new.version::text,
    v_client.email,
    trim(v_client.first_name || ' ' || v_client.last_name),
    v_subject,
    jsonb_build_object(
      'client_first_name', v_client.first_name,
      'client_last_name', v_client.last_name,
      'case_reference', new.reference,
      'case_title', new.title,
      'event', v_event,
      'step_label', coalesce(v_step.label, ''),
      'outcome', coalesce(v_step.outcome, new.outcome, 'pending'),
      'status_label', v_status_label,
      'case_version', new.version
    ),
    v_client.id,
    new.id,
    null,
    null,
    private.member_id(new.organization_id),
    left(format('Avancement du dossier envoyé par e-mail : %s', coalesce(v_step.label, v_status_label)), 200)
  );
  return null;
end;
$$;

create trigger cases_z_email_status
  after update of version on public.cases
  for each row
  when (new.version is distinct from old.version)
  execute function private.enqueue_case_status_email();

-- 2. Relance des pièces manquantes ----------------------------------------------------------------------

create function public.queue_missing_documents_email(p_case_id uuid, p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_client public.clients;
  v_org_name text;
  v_docs jsonb;
  v_count integer;
  v_outbox_id uuid;
begin
  select * into v_case from public.cases c where c.id = p_case_id;
  if not found or not private.has_role(v_case.organization_id, array['owner', 'admin', 'agent']) then
    raise exception 'Dossier introuvable, ou vous n''avez pas le droit de relancer ce client.';
  end if;
  if v_case.status <> 'active' then
    raise exception 'Ce dossier n''est plus en cours : aucune relance n''est possible.';
  end if;

  select * into v_client from public.clients c where c.id = v_case.client_id and c.organization_id = v_case.organization_id;
  if not found or coalesce(trim(v_client.email), '') = '' then
    raise exception 'Ce client n''a pas d''adresse e-mail sur sa fiche : ajoutez-la, puis réessayez.';
  end if;
  if v_client.email_opt_out then
    raise exception 'Ce client s''est désinscrit des relances par e-mail : prévenez-le par téléphone ou WhatsApp.';
  end if;

  -- Même règle que l'écran du dossier : pièces obligatoires à fournir, à corriger ou expirées.
  select
    jsonb_agg(
      jsonb_build_object(
        'label', r.label,
        'status', r.status,
        'comment', case when r.status = 'to_correct' then coalesce(trim(r.review_comment), '') else '' end
      )
      order by r.created_at, r.id
    ),
    count(*)
  into v_docs, v_count
  from public.document_requirements r
  where r.case_id = v_case.id
    and r.organization_id = v_case.organization_id
    and r.is_required
    and r.status in ('not_received', 'to_correct', 'expired');
  if coalesce(v_count, 0) = 0 then
    raise exception 'Aucune pièce obligatoire ne manque sur ce dossier.';
  end if;

  select o.name into v_org_name from public.organizations o where o.id = v_case.organization_id;

  v_outbox_id := private.enqueue_email(
    v_case.organization_id,
    'missing_documents',
    'missing_documents:' || p_request_id::text,
    v_client.email,
    trim(v_client.first_name || ' ' || v_client.last_name),
    format('Pièces attendues pour votre dossier %s — %s', v_case.reference, v_org_name),
    jsonb_build_object(
      'client_first_name', v_client.first_name,
      'client_last_name', v_client.last_name,
      'case_reference', v_case.reference,
      'case_title', v_case.title,
      'missing_documents', v_docs
    ),
    v_client.id,
    v_case.id,
    null,
    null,
    private.member_id(v_case.organization_id),
    format('Relance des pièces manquantes par e-mail (%s pièce%s)', v_count, case when v_count > 1 then 's' else '' end)
  );

  if v_outbox_id is not null then
    update public.email_outbox e set is_automatic = false where e.id = v_outbox_id;
  end if;
  return v_outbox_id;
end;
$$;

-- 3. Revérification juste avant l'envoi -----------------------------------------------------------------

create or replace function private.tidy_email_outbox(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Annule ce qui ne doit plus partir.
  with obsolete as (
    select e.id,
      case
        when e.kind in ('payment_confirmed', 'document_send', 'missing_documents', 'case_status_changed', 'appointment_reminder')
          and e.client_id is null
          then 'Annulé : la fiche client a été supprimée.'
        when e.kind = 'payment_confirmed' and not exists (
            select 1 from public.payments p
            where p.id = e.payment_id and p.organization_id = e.organization_id
              and p.status = 'recorded' and p.receipt_number is not null
          )
          then 'Annulé : le paiement n''est plus confirmé.'
        when e.kind in ('missing_documents', 'case_status_changed', 'appointment_reminder')
          and exists (select 1 from public.clients c where c.id = e.client_id and c.email_opt_out)
          then 'Annulé : le client s''est désinscrit des e-mails.'
        when e.is_automatic
          and e.kind in ('payment_confirmed', 'appointment_reminder', 'case_status_changed', 'missing_documents')
          and not exists (
            select 1 from public.email_settings s
            where s.organization_id = e.organization_id
              and case e.kind
                when 'payment_confirmed' then s.notify_payment_confirmed
                when 'appointment_reminder' then s.notify_appointment_reminder
                when 'case_status_changed' then s.notify_case_status
                when 'missing_documents' then s.notify_missing_documents
              end
          )
          then 'Annulé : cette notification est désactivée par l''agence.'
        when e.kind = 'case_status_changed'
          and e.payload ? 'case_version'
          and not exists (
            select 1 from public.cases cs
            where cs.id = e.case_id and cs.organization_id = e.organization_id
              and cs.version::text = e.payload ->> 'case_version'
          )
          then 'Annulé : le dossier a encore changé depuis (nouvelle étape ou retour en arrière).'
        when e.kind = 'missing_documents'
          and not exists (
            select 1 from public.cases cs
            where cs.id = e.case_id and cs.organization_id = e.organization_id and cs.status = 'active'
          )
          then 'Annulé : le dossier n''est plus en cours.'
      end as reason
    from public.email_outbox e
    where (p_org is null or e.organization_id = p_org)
      and (e.status = 'queued' or (e.status = 'sending' and e.updated_at < now() - interval '15 minutes'))
  ), done as (
    update public.email_outbox e set status = 'cancelled', last_error = o.reason
    from obsolete o
    where e.id = o.id and o.reason is not null
    returning e.id
  )
  update public.communication_logs cl set status = 'cancelled'
  from done d where cl.email_outbox_id = d.id;

  -- Un envoi bloqué qui a épuisé ses tentatives passe en échec (sans renvoi automatique).
  with stuck as (
    update public.email_outbox e set
      status = 'failed',
      last_error = 'Envoi interrompu sans réponse de Brevo. Vérifiez dans Brevo avant de renvoyer.'
    where (p_org is null or e.organization_id = p_org)
      and e.status = 'sending'
      and e.updated_at < now() - interval '15 minutes'
      and e.attempts >= e.max_attempts
    returning e.id
  )
  update public.communication_logs cl set status = 'failed'
  from stuck s where cl.email_outbox_id = s.id;
end;
$$;

-- 4. Envoi demandé depuis l'espace agence : uniquement l'envoi d'un document ----------------------------

create or replace function public.queue_agency_email(
  p_organization_id uuid,
  p_kind text,
  p_idempotency_key text,
  p_client_id uuid,
  p_case_id uuid default null,
  p_payment_id uuid default null,
  p_subject text default '',
  p_payload jsonb default '{}'::jsonb,
  p_summary text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_outbox_id uuid;
begin
  if not private.has_role(p_organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Vous n''avez pas le droit d''envoyer des e-mails pour cette agence.';
  end if;
  -- Confirmation de paiement : déclencheur du paiement. Relance des pièces : queue_missing_documents_email.
  -- Avancement du dossier : déclencheur du dossier. Ici, seulement l'envoi d'un document choisi par l'agent.
  if p_kind <> 'document_send' then
    raise exception 'Type d''e-mail non autorisé.';
  end if;

  select * into v_client from public.clients c where c.id = p_client_id and c.organization_id = p_organization_id;
  if not found then
    raise exception 'Client introuvable.';
  end if;
  if coalesce(trim(v_client.email), '') = '' then
    raise exception 'Ce client n''a pas d''adresse e-mail enregistrée sur sa fiche.';
  end if;
  if p_case_id is not null and not exists (
    select 1 from public.cases cs
    where cs.id = p_case_id and cs.organization_id = p_organization_id and cs.client_id = p_client_id
  ) then
    raise exception 'Ce dossier n''appartient pas à ce client.';
  end if;
  if p_payment_id is not null and not exists (
    select 1 from public.payments p
    where p.id = p_payment_id and p.organization_id = p_organization_id and p.client_id = p_client_id
  ) then
    raise exception 'Ce paiement n''appartient pas à ce client.';
  end if;

  v_outbox_id := private.enqueue_email(
    p_organization_id,
    p_kind,
    p_idempotency_key,
    v_client.email,
    trim(v_client.first_name || ' ' || v_client.last_name),
    p_subject,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'client_first_name', v_client.first_name,
      'client_last_name', v_client.last_name
    ),
    v_client.id,
    p_case_id,
    p_payment_id,
    null,
    private.member_id(p_organization_id),
    p_summary
  );

  if v_outbox_id is not null then
    update public.email_outbox e set is_automatic = false where e.id = v_outbox_id;
  end if;

  return v_outbox_id;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function private.enqueue_case_status_email() from public, anon, authenticated;
revoke all on function private.tidy_email_outbox(uuid) from public, anon, authenticated;
revoke all on function public.queue_missing_documents_email(uuid, uuid) from public, anon;
grant execute on function public.queue_missing_documents_email(uuid, uuid) to authenticated;
