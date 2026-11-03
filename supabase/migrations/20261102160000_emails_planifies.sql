-- Envois planifiés (étape 5 de l'intégration Brevo). Une tâche planifiée (Vercel Cron, une fois par jour)
-- appelle l'application avec un secret ; l'application appelle ces fonctions avec le même secret (vérifié par
-- son empreinte SHA-256, clé « email_worker »), puis confie les e-mails à Brevo.
--
-- 1. schedule_system_emails : prépare les e-mails du jour.
--    - Rappel de rendez-vous la veille (réglage de l'agence) : rendez-vous prévus ou confirmés, demain dans le
--      fuseau de l'agence ; pas pour les échéances internes ni le départ.
--    - Relance automatique des pièces manquantes (réglage de l'agence) : dossier en cours qui attend le client,
--      sans changement depuis 3 jours, au plus une relance par semaine et 3 relances automatiques par dossier.
--    - Alertes d'abonnement au propriétaire (toujours) : fin d'essai à 7 jours et la veille, essai terminé,
--      échéance à 7 jours, échéance dépassée, espace suspendu. Une seule fois par étape.
-- 2. claim_system_emails ne prend plus les e-mails qui joignent un PDF (paiement, document) : sans personne
--    connectée, le PDF ne peut pas être produit ; ils sont envoyés depuis l'espace de l'agence.
-- 3. Revérification avant l'envoi d'un rappel : rendez-vous toujours prévu, à la même heure, et pas encore passé.

-- Pièces obligatoires à fournir, à corriger ou expirées d'un dossier (même règle que l'écran du dossier).
create function private.case_missing_documents(p_case_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_agg(
    jsonb_build_object(
      'label', r.label,
      'status', r.status,
      'comment', case when r.status = 'to_correct' then coalesce(trim(r.review_comment), '') else '' end
    )
    order by r.created_at, r.id
  )
  from public.document_requirements r
  where r.case_id = p_case_id
    and r.is_required
    and r.status in ('not_received', 'to_correct', 'expired');
$$;

-- La relance demandée par un membre utilise la même liste.
create or replace function public.queue_missing_documents_email(p_case_id uuid, p_request_id uuid) returns uuid
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

  v_docs := private.case_missing_documents(v_case.id);
  v_count := coalesce(jsonb_array_length(v_docs), 0);
  if v_count = 0 then
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

-- 1. E-mails du jour -----------------------------------------------------------------------------------

create function public.schedule_system_emails(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_id uuid;
  v_docs jsonb;
  v_count integer;
  v_stage text;
  v_ref timestamptz;
  v_title text;
  v_status_label text;
  v_detail text;
  v_reminders integer := 0;
  v_relances integer := 0;
  v_notices integer := 0;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;

  -- a) Rappel de rendez-vous la veille.
  for r in
    select a.id, a.organization_id, a.case_id, a.title, a.starts_at, a.all_day, a.location,
      o.name as org_name, cl.id as client_id, cl.email, cl.first_name, cl.last_name, cs.reference as case_reference
    from public.appointments a
    join public.organizations o on o.id = a.organization_id and not o.is_demo
    join public.email_settings s on s.organization_id = a.organization_id and s.notify_appointment_reminder
    left join public.cases cs on cs.id = a.case_id and cs.organization_id = a.organization_id
    join public.clients cl on cl.id = coalesce(a.client_id, cs.client_id) and cl.organization_id = a.organization_id
    where a.status in ('planned', 'confirmed')
      and a.kind not in ('application_deadline', 'document_deadline', 'departure')
      and a.starts_at > now()
      and (a.starts_at at time zone o.timezone)::date = (now() at time zone o.timezone)::date + 1
      and coalesce(trim(cl.email), '') <> ''
      and not cl.email_opt_out
  loop
    v_id := private.enqueue_email(
      r.organization_id,
      'appointment_reminder',
      'appointment_reminder:' || r.id::text || ':' || extract(epoch from r.starts_at)::bigint::text,
      r.email,
      trim(r.first_name || ' ' || r.last_name),
      left(format('Rappel de rendez-vous : %s (%s)', r.title, r.org_name), 200),
      jsonb_build_object(
        'client_first_name', r.first_name,
        'client_last_name', r.last_name,
        'appointment_title', r.title,
        'starts_at', r.starts_at,
        'all_day', r.all_day,
        'location', coalesce(r.location, ''),
        'case_reference', coalesce(r.case_reference, '')
      ),
      r.client_id,
      r.case_id,
      null,
      r.id,
      null,
      left(format('Rappel de rendez-vous envoyé par e-mail : %s', r.title), 200)
    );
    if v_id is not null then
      v_reminders := v_reminders + 1;
    end if;
  end loop;

  -- b) Relance automatique des pièces manquantes.
  for r in
    select cs.id, cs.organization_id, cs.reference, cs.title, o.name as org_name, o.timezone,
      cl.id as client_id, cl.email, cl.first_name, cl.last_name
    from public.cases cs
    join public.organizations o on o.id = cs.organization_id and not o.is_demo
    join public.email_settings s on s.organization_id = cs.organization_id and s.notify_missing_documents
    join public.clients cl on cl.id = cs.client_id and cl.organization_id = cs.organization_id
    where cs.status = 'active'
      and cs.updated_at < now() - interval '3 days'
      and coalesce(trim(cl.email), '') <> ''
      and not cl.email_opt_out
      and exists (
        select 1 from public.case_steps st
        where st.case_id = cs.id and st.status = 'in_progress' and st.kind = 'client_action'
      )
      and not exists (
        select 1 from public.email_outbox e
        where e.case_id = cs.id and e.kind = 'missing_documents' and e.status <> 'cancelled'
          and e.created_at > now() - interval '7 days'
      )
      and (
        select count(*) from public.email_outbox e
        where e.case_id = cs.id and e.kind = 'missing_documents' and e.is_automatic and e.status <> 'cancelled'
      ) < 3
  loop
    v_docs := private.case_missing_documents(r.id);
    v_count := coalesce(jsonb_array_length(v_docs), 0);
    continue when v_count = 0;
    v_id := private.enqueue_email(
      r.organization_id,
      'missing_documents',
      'missing_documents:auto:' || r.id::text || ':' || ((now() at time zone r.timezone)::date)::text,
      r.email,
      trim(r.first_name || ' ' || r.last_name),
      format('Pièces attendues pour votre dossier %s — %s', r.reference, r.org_name),
      jsonb_build_object(
        'client_first_name', r.first_name,
        'client_last_name', r.last_name,
        'case_reference', r.reference,
        'case_title', r.title,
        'missing_documents', v_docs
      ),
      r.client_id,
      r.id,
      null,
      null,
      null,
      format('Relance automatique des pièces manquantes (%s pièce%s)', v_count, case when v_count > 1 then 's' else '' end)
    );
    if v_id is not null then
      v_relances := v_relances + 1;
    end if;
  end loop;

  -- c) Alertes d'abonnement au propriétaire de l'agence.
  for r in
    select o.id as org_id, o.name as org_name, s.status, s.trial_ends_at, s.current_period_end, s.updated_at,
      m.email as owner_email, m.full_name as owner_name
    from public.subscriptions s
    join public.organizations o on o.id = s.organization_id and not o.is_demo
    join lateral (
      select mm.email, mm.full_name from public.members mm
      where mm.organization_id = o.id and mm.role = 'owner' and mm.removed_at is null and coalesce(trim(mm.email), '') <> ''
      order by mm.created_at asc limit 1
    ) m on true
  loop
    v_stage := null;
    v_ref := null;
    if r.status = 'trialing' and r.trial_ends_at is not null then
      if r.trial_ends_at <= now() then
        if r.trial_ends_at > now() - interval '7 days' then v_stage := 'trial_ended'; end if;
      elsif r.trial_ends_at <= now() + interval '1 day' then
        v_stage := 'trial_1d';
      elsif r.trial_ends_at <= now() + interval '7 days' then
        v_stage := 'trial_7d';
      end if;
      v_ref := r.trial_ends_at;
    elsif r.status in ('active', 'past_due') and r.current_period_end is not null then
      if r.current_period_end <= now() then
        if r.current_period_end > now() - interval '7 days' then v_stage := 'period_ended'; end if;
      elsif r.current_period_end <= now() + interval '7 days' then
        v_stage := 'renewal_7d';
      end if;
      v_ref := r.current_period_end;
    elsif r.status = 'suspended' and r.updated_at > now() - interval '7 days' then
      v_stage := 'suspended';
      v_ref := r.updated_at;
    end if;
    continue when v_stage is null;

    v_title := case v_stage
      when 'trial_7d' then 'Votre essai gratuit se termine bientôt'
      when 'trial_1d' then 'Votre essai gratuit se termine demain'
      when 'trial_ended' then 'Votre essai gratuit est terminé'
      when 'renewal_7d' then 'Votre abonnement arrive à échéance'
      when 'period_ended' then 'Votre abonnement est arrivé à échéance'
      else 'Votre espace est suspendu'
    end;
    v_status_label := case
      when v_stage like 'trial_%' then 'Essai gratuit'
      when v_stage = 'suspended' then 'Suspendu (lecture seule)'
      else 'Abonnement'
    end;
    v_detail := case v_stage
      when 'trial_7d' then 'Votre période d''essai de SELECT Agency se termine bientôt. Pour continuer sans interruption, choisissez votre formule avant l''échéance.'
      when 'trial_1d' then 'Votre période d''essai se termine demain. Sans abonnement, votre espace passera en lecture seule : vos données restent conservées.'
      when 'trial_ended' then 'Votre période d''essai est terminée : votre espace est en lecture seule. Vos données sont conservées ; choisissez une formule pour retrouver toutes les fonctions.'
      when 'renewal_7d' then 'Votre abonnement arrive à échéance. Pensez à le renouveler avant cette date pour éviter toute interruption.'
      when 'period_ended' then 'L''échéance de votre abonnement est passée. Réglez le renouvellement pour éviter la suspension de votre espace.'
      else 'Votre espace SELECT Agency est en lecture seule. Vos données sont conservées. Écrivez-nous depuis « Aide et support » pour le réactiver.'
    end;

    v_id := private.enqueue_email(
      r.org_id,
      'subscription_notice',
      'subscription_notice:' || r.org_id::text || ':' || v_stage || ':' || extract(epoch from v_ref)::bigint::text,
      r.owner_email,
      r.owner_name,
      left(format('%s — %s', v_title, r.org_name), 200),
      jsonb_build_object(
        'owner_name', r.owner_name,
        'notice_title', v_title,
        'status_label', v_status_label,
        'detail_text', v_detail,
        'deadline_at', case when v_stage = 'suspended' then null else v_ref end,
        'stage', v_stage
      ),
      null,
      null,
      null,
      null,
      null,
      null
    );
    if v_id is not null then
      v_notices := v_notices + 1;
    end if;
  end loop;

  return jsonb_build_object('reminders', v_reminders, 'relances', v_relances, 'notices', v_notices);
end;
$$;

-- 2. Envois par la tâche planifiée : jamais les e-mails qui joignent un PDF ------------------------------

create or replace function public.claim_system_emails(p_secret text, p_limit integer default 25)
returns setof public.email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;

  perform private.tidy_email_outbox(null);

  return query
  with claimed as (
    select e.id
    from public.email_outbox e
    where (
        (e.status = 'queued' and e.next_attempt_at <= now())
        or (e.status = 'sending' and e.updated_at < now() - interval '15 minutes')
      )
      and e.attempts < e.max_attempts
      -- Le PDF d'un reçu ou d'un document se prépare avec les droits d'un membre : envoi depuis l'agence.
      and e.kind not in ('payment_confirmed', 'document_send')
    order by e.created_at asc
    limit greatest(1, least(coalesce(p_limit, 25), 50))
    for update skip locked
  )
  update public.email_outbox o
  set status = 'sending', attempts = o.attempts + 1
  from claimed c
  where o.id = c.id
  returning o.*;
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
        when e.kind = 'appointment_reminder'
          and not exists (
            select 1 from public.appointments a
            where a.id = e.appointment_id and a.organization_id = e.organization_id
              and a.status in ('planned', 'confirmed')
              and a.starts_at > now()
              and (e.payload ->> 'starts_at') is not null
              and a.starts_at = (e.payload ->> 'starts_at')::timestamptz
          )
          then 'Annulé : le rendez-vous a été déplacé, annulé ou est déjà passé.'
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

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function private.case_missing_documents(uuid) from public, anon, authenticated;
revoke all on function private.tidy_email_outbox(uuid) from public, anon, authenticated;
revoke all on function public.schedule_system_emails(text) from public;
grant execute on function public.schedule_system_emails(text) to anon, authenticated;
