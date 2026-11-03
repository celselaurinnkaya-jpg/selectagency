-- SELECT Agency — E-mails (Brevo), étape 1 : corrections de la base après relecture.
-- La migration 20261102100000_emails_brevo.sql est déjà appliquée en production ; on corrige par-dessus.
--
-- 1. Décision du 2 novembre 2026 : AUCUN e-mail client automatique tant que l'agence ne l'a pas activé.
--    Les e-mails de compte et d'abonnement partent toujours : l'interrupteur « abonnement » disparaît.
-- 2. Les secrets système (planificateur, webhook Brevo) ne sont plus stockés en clair : seulement leur empreinte SHA-256.
-- 3. Seuls les rôles qui travaillent sur les dossiers peuvent réclamer et clôturer des envois de leur agence.
-- 4. Juste avant chaque envoi, la base revérifie : paiement toujours confirmé, fiche client toujours présente,
--    client toujours inscrit, notification toujours activée. Sinon l'e-mail est annulé, jamais envoyé.
-- 5. Une erreur définitive (adresse refusée, clé invalide) n'est pas retentée. Un envoi resté bloqué
--    n'est repris qu'après 15 minutes (Brevo reçoit une clé anti-doublon, voir src/lib/email/brevo.ts).
-- 6. Webhook : un report temporaire (soft_bounce, deferred) ne marque plus l'e-mail « rejeté » ; un e-mail
--    signalé comme indésirable ne repasse jamais « livré ».
-- 7. Une confirmation de paiement ne peut venir que de la confirmation réelle du paiement (plus d'envoi manuel).
-- 8. Le fuseau horaire de l'agence accompagne chaque e-mail (dates affichées à l'heure de l'agence).

-- 1. Réglages : tout désactivé par défaut, plus d'interrupteur « abonnement » --------------------------

alter table public.email_settings
  alter column notify_payment_confirmed set default false,
  alter column notify_appointment_reminder set default false;

-- Aucune agence n'a encore pu choisir (l'écran des réglages n'était pas en ligne) : on applique la décision partout.
update public.email_settings set
  notify_payment_confirmed = false,
  notify_appointment_reminder = false,
  notify_case_status = false,
  notify_missing_documents = false;

alter table public.email_settings drop column notify_subscription;

create or replace function public.save_email_settings(p_organization_id uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reply text := lower(trim(coalesce(p_settings ->> 'reply_to_email', '')));
begin
  if not private.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent modifier les réglages des e-mails.';
  end if;
  if v_reply <> '' and v_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'L''adresse e-mail de réponse est invalide.';
  end if;

  insert into public.email_settings as s (
    organization_id, sender_name, reply_to_email,
    notify_payment_confirmed, notify_appointment_reminder,
    notify_case_status, notify_missing_documents
  ) values (
    p_organization_id,
    left(trim(coalesce(p_settings ->> 'sender_name', '')), 120),
    v_reply,
    coalesce((p_settings ->> 'notify_payment_confirmed')::boolean, false),
    coalesce((p_settings ->> 'notify_appointment_reminder')::boolean, false),
    coalesce((p_settings ->> 'notify_case_status')::boolean, false),
    coalesce((p_settings ->> 'notify_missing_documents')::boolean, false)
  )
  on conflict (organization_id) do update set
    sender_name = excluded.sender_name,
    reply_to_email = excluded.reply_to_email,
    notify_payment_confirmed = excluded.notify_payment_confirmed,
    notify_appointment_reminder = excluded.notify_appointment_reminder,
    notify_case_status = excluded.notify_case_status,
    notify_missing_documents = excluded.notify_missing_documents;
end;
$$;

-- 2. Secrets système : empreinte SHA-256 uniquement -----------------------------------------------------
-- Pour enregistrer un secret, on ne colle jamais le secret lui-même, seulement son empreinte :
--   insert into private.system_secrets (key, secret_sha256) values ('email_worker', '<64 caractères hexadécimaux>')
--   on conflict (key) do update set secret_sha256 = excluded.secret_sha256, updated_at = now();

alter table private.system_secrets add column secret_sha256 text;
update private.system_secrets set secret_sha256 = encode(sha256(convert_to(value, 'UTF8')), 'hex');
alter table private.system_secrets drop column value;
alter table private.system_secrets
  alter column secret_sha256 set not null,
  add constraint system_secrets_sha256_check check (secret_sha256 ~ '^[0-9a-f]{64}$');

create or replace function private.check_system_secret(p_key text, p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select char_length(coalesce(p_secret, '')) >= 32 and exists (
    select 1 from private.system_secrets s
    where s.key = p_key and s.secret_sha256 = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  );
$$;

-- 3. File d'envoi : origine (automatique ou demandée), dernier événement Brevo, statut « annulé » --------

alter table public.email_outbox
  add column is_automatic boolean not null default true,
  add column last_event text check (char_length(last_event) <= 40),
  add column last_event_at timestamptz;

alter table public.communication_logs drop constraint communication_logs_status_check;
alter table public.communication_logs
  add constraint communication_logs_status_check check (status in (
    'prepared_manual', 'logged', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'cancelled'
  ));

-- Les e-mails clients inscrits avec les anciens réglages (tout activé) n'ont jamais pu partir : on les annule.
with cancelled as (
  update public.email_outbox e set
    status = 'cancelled',
    last_error = 'Annulé : e-mails clients désactivés par défaut (décision du 2 novembre 2026).'
  where e.status in ('queued', 'sending')
    and e.is_automatic
    and e.kind in ('payment_confirmed', 'appointment_reminder', 'case_status_changed', 'missing_documents')
  returning e.id
)
update public.communication_logs cl set status = 'cancelled'
from cancelled c where cl.email_outbox_id = c.id;

-- 4. Paiement confirmé : uniquement si l'agence a activé cet e-mail ------------------------------------

create or replace function private.enqueue_payment_confirmed_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.email_settings;
  v_client public.clients;
  v_case public.cases;
  v_org public.organizations;
  v_balance bigint;
begin
  if private.importing() then
    return null;
  end if;

  -- Uniquement quand le paiement est confirmé (« recorded ») avec son numéro de reçu
  if new.status <> 'recorded' or new.receipt_number is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'recorded' then
    return null;
  end if;

  select * into v_org from public.organizations o where o.id = new.organization_id;
  if not found or v_org.is_demo then
    return null;
  end if;

  -- Désactivé tant que l'agence ne l'a pas activé (absence de réglage = désactivé)
  select * into v_settings from public.email_settings s where s.organization_id = new.organization_id;
  if not found or not v_settings.notify_payment_confirmed then
    return null;
  end if;

  select * into v_client from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id;
  if not found or coalesce(trim(v_client.email), '') = '' then
    return null;
  end if;

  select * into v_case from public.cases cs where cs.id = new.case_id and cs.organization_id = new.organization_id;
  v_balance := coalesce(new.balance_after_minor, private.case_balance(new.case_id));

  perform private.enqueue_email(
    new.organization_id,
    'payment_confirmed',
    'payment_confirmed:' || new.id::text,
    v_client.email,
    trim(v_client.first_name || ' ' || v_client.last_name),
    format('Confirmation de paiement — Reçu %s (%s)', new.receipt_number, v_org.name),
    jsonb_build_object(
      'client_first_name', v_client.first_name,
      'client_last_name', v_client.last_name,
      'receipt_number', new.receipt_number,
      'amount_minor', new.amount_minor,
      'currency', new.currency,
      'method_label', new.method_label,
      'transaction_reference', coalesce(new.transaction_reference, ''),
      'paid_at', new.paid_at,
      'balance_after_minor', v_balance,
      'case_reference', coalesce(v_case.reference, ''),
      'case_title', coalesce(v_case.title, '')
    ),
    v_client.id,
    new.case_id,
    new.id,
    null,
    coalesce(new.confirmed_by, new.received_by),
    format('Confirmation de paiement et reçu %s (PDF)', new.receipt_number)
  );
  return null;
end;
$$;

-- 5. Revérification juste avant l'envoi -----------------------------------------------------------------

create function private.tidy_email_outbox(p_org uuid) returns void
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

-- Clôture commune d'un envoi (agence ou planificateur). Sans effet si l'envoi n'est plus « en cours ».
create function private.complete_email(
  p_email_id uuid,
  p_success boolean,
  p_brevo_message_id text,
  p_error text,
  p_permanent boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_outbox;
  v_status text;
begin
  select * into v_row from public.email_outbox e where e.id = p_email_id for update;
  if not found or v_row.status <> 'sending' then
    return;
  end if;

  if p_success then
    v_status := 'sent';
    update public.email_outbox e set
      status = 'sent',
      brevo_message_id = left(nullif(trim(coalesce(p_brevo_message_id, '')), ''), 160),
      sent_at = now(),
      last_error = null
    where e.id = v_row.id;
  else
    v_status := case
      when coalesce(p_permanent, false) or v_row.attempts >= v_row.max_attempts then 'failed'
      else 'queued'
    end;
    update public.email_outbox e set
      status = v_status,
      last_error = left(coalesce(nullif(trim(p_error), ''), 'Erreur d''envoi Brevo'), 500),
      next_attempt_at = now() + (power(2, least(v_row.attempts, 4)) * interval '1 minute')
    where e.id = v_row.id;
  end if;

  update public.communication_logs cl set status = v_status
  where cl.email_outbox_id = v_row.id;
end;
$$;

-- 6. Réclamer et clôturer des envois : rôles contrôlés, revérification avant envoi ------------------------

create or replace function public.claim_agency_emails(p_organization_id uuid, p_limit integer default 10)
returns setof public.email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_organization_id, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Accès refusé à la file d''envoi de cette agence.';
  end if;

  perform private.tidy_email_outbox(p_organization_id);

  return query
  with claimed as (
    select e.id
    from public.email_outbox e
    where e.organization_id = p_organization_id
      and (
        (e.status = 'queued' and e.next_attempt_at <= now())
        or (e.status = 'sending' and e.updated_at < now() - interval '15 minutes')
      )
      and e.attempts < e.max_attempts
    order by e.created_at asc
    limit greatest(1, least(coalesce(p_limit, 10), 25))
    for update skip locked
  )
  update public.email_outbox o
  set status = 'sending', attempts = o.attempts + 1
  from claimed c
  where o.id = c.id
  returning o.*;
end;
$$;

drop function public.complete_agency_email(uuid, boolean, text, text);

create function public.complete_agency_email(
  p_email_id uuid,
  p_success boolean,
  p_brevo_message_id text default null,
  p_error text default null,
  p_permanent boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select e.organization_id into v_org from public.email_outbox e where e.id = p_email_id;
  if not found then
    raise exception 'E-mail introuvable.';
  end if;
  if not private.has_role(v_org, array['owner', 'admin', 'agent', 'accountant']) then
    raise exception 'Accès refusé à cet envoi.';
  end if;
  perform private.complete_email(p_email_id, p_success, p_brevo_message_id, p_error, p_permanent);
end;
$$;

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

drop function public.complete_system_email(text, uuid, boolean, text, text);

create function public.complete_system_email(
  p_secret text,
  p_email_id uuid,
  p_success boolean,
  p_brevo_message_id text default null,
  p_error text default null,
  p_permanent boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  perform private.complete_email(p_email_id, p_success, p_brevo_message_id, p_error, p_permanent);
end;
$$;

-- 7. Webhook Brevo : statuts fiables -------------------------------------------------------------------

create or replace function public.apply_brevo_webhook(
  p_secret text,
  p_brevo_message_id text,
  p_event text,
  p_reason text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_outbox;
  v_event text := lower(trim(coalesce(p_event, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_new_status text;
begin
  if not private.check_system_secret('brevo_webhook', p_secret) then
    raise exception 'Secret webhook invalide.' using errcode = '42501';
  end if;

  if coalesce(trim(p_brevo_message_id), '') = '' or v_event = '' then
    return false;
  end if;

  select * into v_row from public.email_outbox e
  where e.brevo_message_id = trim(p_brevo_message_id)
  order by e.created_at desc limit 1
  for update;
  if not found then
    return false;
  end if;

  update public.email_outbox e set last_event = left(v_event, 40), last_event_at = now()
  where e.id = v_row.id;

  if v_event = 'delivered' then
    -- La livraison prouve l'envoi, même après une réponse perdue ; mais un e-mail rejeté
    -- ou signalé comme indésirable ne repasse jamais « livré ».
    if v_row.status in ('queued', 'sending', 'sent', 'failed') then
      v_new_status := 'delivered';
    end if;
  elsif v_event in ('hard_bounce', 'invalid_email', 'blocked', 'error') then
    v_new_status := 'bounced';
  elsif v_event in ('spam', 'complaint') then
    v_new_status := 'complained';
  elsif v_event in ('soft_bounce', 'deferred') then
    -- Report temporaire : Brevo réessaie lui-même, le statut ne change pas.
    update public.email_outbox e set
      last_error = left(coalesce(v_reason, 'Distribution retardée, Brevo réessaie.'), 500)
    where e.id = v_row.id;
  elsif v_event = 'unsubscribed' then
    if v_row.client_id is not null then
      update public.clients c set email_opt_out = true, email_opt_out_at = coalesce(c.email_opt_out_at, now())
      where c.id = v_row.client_id;
    end if;
  end if;

  if v_new_status is not null then
    update public.email_outbox e set
      status = v_new_status,
      delivered_at = case when v_new_status = 'delivered' then coalesce(e.delivered_at, now()) else e.delivered_at end,
      last_error = case
        when v_new_status in ('bounced', 'complained') then left(coalesce(v_reason, v_event), 500)
        when v_new_status = 'delivered' then null
        else e.last_error
      end
    where e.id = v_row.id;

    update public.communication_logs cl set status = v_new_status
    where cl.email_outbox_id = v_row.id;

    if v_new_status = 'complained' and v_row.client_id is not null then
      update public.clients c set email_opt_out = true, email_opt_out_at = coalesce(c.email_opt_out_at, now())
      where c.id = v_row.client_id;
    end if;
  end if;

  return true;
end;
$$;

-- 8. Envoi demandé depuis l'espace agence : jamais de confirmation de paiement manuelle ----------------

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
  -- La confirmation de paiement part uniquement de la confirmation réelle du paiement (déclencheur).
  if p_kind not in ('document_send', 'missing_documents', 'case_status_changed') then
    raise exception 'Type d''e-mail non autorisé.';
  end if;

  select * into v_client from public.clients c where c.id = p_client_id and c.organization_id = p_organization_id;
  if not found then
    raise exception 'Client introuvable.';
  end if;
  if coalesce(trim(v_client.email), '') = '' then
    raise exception 'Ce client n''a pas d''adresse e-mail enregistrée sur sa fiche.';
  end if;
  if v_client.email_opt_out and p_kind in ('missing_documents', 'case_status_changed') then
    raise exception 'Ce client s''est désinscrit des relances et notifications par e-mail.';
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

-- 9. Fuseau horaire de l'agence dans les données de l'e-mail (dates affichées à l'heure de l'agence) -----

create or replace function private.enqueue_email(
  p_org uuid,
  p_kind text,
  p_idempotency_key text,
  p_recipient_email text,
  p_recipient_name text,
  p_subject text,
  p_payload jsonb,
  p_client_id uuid default null,
  p_case_id uuid default null,
  p_payment_id uuid default null,
  p_appointment_id uuid default null,
  p_actor_id uuid default null,
  p_summary text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations;
  v_settings public.email_settings;
  v_inv public.invoice_settings;
  v_client public.clients;
  v_email text := lower(trim(coalesce(p_recipient_email, '')));
  v_sender text;
  v_reply text;
  v_owner_email text;
  v_outbox_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if private.importing() then
    return null;
  end if;

  select * into v_org from public.organizations o where o.id = p_org;
  if not found or v_org.is_demo then
    return null;
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;

  if p_client_id is not null then
    select * into v_client from public.clients c where c.id = p_client_id and c.organization_id = p_org;
    if not found or v_client.is_demo_fixture then
      return null;
    end if;
    -- Respecter la désinscription du client pour les notifications non sollicitées
    if v_client.email_opt_out and p_kind in ('missing_documents', 'case_status_changed', 'appointment_reminder') then
      return null;
    end if;
    v_payload := v_payload || jsonb_build_object('unsubscribe_token', v_client.email_unsubscribe_token::text);
  end if;

  select * into v_settings from public.email_settings s where s.organization_id = p_org;
  select * into v_inv from public.invoice_settings i where i.organization_id = p_org;
  select m.email into v_owner_email from public.members m
  where m.organization_id = p_org and m.role = 'owner' and m.removed_at is null
  order by m.created_at asc limit 1;

  v_sender := coalesce(nullif(trim(v_settings.sender_name), ''), nullif(trim(v_inv.legal_name), ''), v_org.name);
  -- Le domaine d'envoi n'a pas de boîte de réception : les réponses vont toujours à l'agence.
  v_reply := coalesce(nullif(trim(v_settings.reply_to_email), ''), nullif(trim(v_inv.email), ''), nullif(trim(v_owner_email), ''));

  v_payload := v_payload || jsonb_build_object(
    'agency_name', v_org.name,
    'agency_city', v_org.city,
    'agency_timezone', v_org.timezone,
    'agency_phone', coalesce(v_inv.phone, ''),
    'agency_email', coalesce(v_reply, ''),
    'agency_address', coalesce(v_inv.address, '')
  );

  insert into public.email_outbox (
    organization_id, client_id, case_id, payment_id, appointment_id,
    kind, idempotency_key, recipient_email, recipient_name,
    sender_name, reply_to_email, subject, payload, created_by
  ) values (
    p_org, p_client_id, p_case_id, p_payment_id, p_appointment_id,
    p_kind, p_idempotency_key, v_email, left(trim(coalesce(p_recipient_name, '')), 160),
    left(v_sender, 120), v_reply, left(trim(p_subject), 200), v_payload, p_actor_id
  )
  on conflict (idempotency_key) do nothing
  returning id into v_outbox_id;

  if v_outbox_id is not null and p_client_id is not null then
    perform set_config('select_agency.system_email', 'on', true);
    insert into public.communication_logs (
      organization_id, client_id, case_id, channel, status, summary, actor_id, email_outbox_id, recipient_email
    ) values (
      p_org, p_client_id, p_case_id, 'email', 'queued',
      left(coalesce(nullif(trim(p_summary), ''), trim(p_subject)), 200),
      coalesce(p_actor_id, private.member_id(p_org)),
      v_outbox_id,
      v_email
    );
    perform set_config('select_agency.system_email', 'off', true);
  end if;

  return v_outbox_id;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function
  private.tidy_email_outbox(uuid),
  private.complete_email(uuid, boolean, text, text, boolean)
from public, anon, authenticated;

revoke all on function public.complete_agency_email(uuid, boolean, text, text, boolean) from public, anon;
grant execute on function public.complete_agency_email(uuid, boolean, text, text, boolean) to authenticated;

revoke all on function public.complete_system_email(text, uuid, boolean, text, text, boolean) from public;
grant execute on function public.complete_system_email(text, uuid, boolean, text, text, boolean) to anon, authenticated;
