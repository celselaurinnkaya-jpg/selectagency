-- SELECT Agency — E-mails transactionnels (Brevo) : réglages par agence, file d'envoi sans doublon,
-- désinscription des clients et suivi de livraison dans l'historique des communications.
--
-- Principes :
-- - Aucun e-mail n'est inscrit pour une agence de démonstration ni pendant l'import fictif.
-- - Un paiement annoncé (« pending ») ne déclenche aucun e-mail : l'inscription dans la file d'envoi
--   se fait uniquement quand le paiement est confirmé (« recorded ») et possède son numéro de reçu.
-- - Chaque événement possède une clé d'idempotence unique (ex. « payment_confirmed:<id> ») : le même
--   événement ne peut jamais être inscrit deux fois.
-- - « sent » signifie accepté par Brevo ; « delivered » n'est posé que sur confirmation du webhook Brevo.

-- 1. Réglages d'e-mails par agence --------------------------------------------------------------------

create table public.email_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  sender_name text not null default '' check (char_length(sender_name) <= 120),
  reply_to_email text not null default '' check (char_length(reply_to_email) <= 254),
  notify_payment_confirmed boolean not null default true,
  notify_appointment_reminder boolean not null default true,
  notify_case_status boolean not null default false,
  notify_missing_documents boolean not null default false,
  notify_subscription boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger email_settings_touch before update on public.email_settings
for each row execute function private.touch_updated_at();

alter table public.email_settings enable row level security;
revoke all on public.email_settings from anon;
revoke insert, update, delete on public.email_settings from authenticated;
grant select on public.email_settings to authenticated;

create policy email_settings_select on public.email_settings for select to authenticated
  using (organization_id in (select private.my_org_ids()));

insert into public.email_settings (organization_id)
select o.id from public.organizations o
on conflict (organization_id) do nothing;

create function private.init_email_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.email_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

create trigger organizations_init_email_settings after insert on public.organizations
for each row execute function private.init_email_settings();

create function public.save_email_settings(p_organization_id uuid, p_settings jsonb) returns void
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
    notify_case_status, notify_missing_documents, notify_subscription
  ) values (
    p_organization_id,
    left(trim(coalesce(p_settings ->> 'sender_name', '')), 120),
    v_reply,
    coalesce((p_settings ->> 'notify_payment_confirmed')::boolean, true),
    coalesce((p_settings ->> 'notify_appointment_reminder')::boolean, true),
    coalesce((p_settings ->> 'notify_case_status')::boolean, false),
    coalesce((p_settings ->> 'notify_missing_documents')::boolean, false),
    coalesce((p_settings ->> 'notify_subscription')::boolean, true)
  )
  on conflict (organization_id) do update set
    sender_name = excluded.sender_name,
    reply_to_email = excluded.reply_to_email,
    notify_payment_confirmed = excluded.notify_payment_confirmed,
    notify_appointment_reminder = excluded.notify_appointment_reminder,
    notify_case_status = excluded.notify_case_status,
    notify_missing_documents = excluded.notify_missing_documents,
    notify_subscription = excluded.notify_subscription;
end;
$$;

-- 2. Désinscription des clients aux notifications non essentielles ------------------------------------

alter table public.clients
  add column email_opt_out boolean not null default false,
  add column email_opt_out_at timestamptz,
  add column email_unsubscribe_token uuid not null unique default gen_random_uuid();

-- L'import de la démonstration insère des lignes via jsonb_populate_recordset (colonnes absentes = null) :
-- on complète email_opt_out et email_unsubscribe_token avant l'insertion.
create or replace function private.default_client_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.status := coalesce(new.status, 'client');
  new.email_opt_out := coalesce(new.email_opt_out, false);
  new.email_unsubscribe_token := coalesce(new.email_unsubscribe_token, gen_random_uuid());
  return new;
end;
$$;

create function public.unsubscribe_client_email(p_token uuid, p_resubscribe boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_agency_name text;
  v_opt_out boolean := not coalesce(p_resubscribe, false);
begin
  if p_token is null then
    raise exception 'Lien de désinscription invalide.';
  end if;
  update public.clients c set
    email_opt_out = v_opt_out,
    email_opt_out_at = case when v_opt_out then now() else null end
  where c.email_unsubscribe_token = p_token
  returning * into v_client;

  if not found then
    raise exception 'Lien de désinscription introuvable ou expiré.';
  end if;

  select o.name into v_agency_name from public.organizations o where o.id = v_client.organization_id;
  return jsonb_build_object(
    'first_name', v_client.first_name,
    'agency_name', coalesce(v_agency_name, 'SELECT Agency'),
    'unsubscribed', v_client.email_opt_out
  );
end;
$$;

-- 3. File d'envoi d'e-mails et statuts de communication -----------------------------------------------

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid,
  case_id uuid,
  payment_id uuid,
  appointment_id uuid,
  kind text not null check (kind in (
    'agency_welcome',
    'payment_confirmed',
    'document_send',
    'missing_documents',
    'case_status_changed',
    'appointment_reminder',
    'subscription_notice'
  )),
  idempotency_key text not null unique check (char_length(idempotency_key) between 3 and 200),
  recipient_email text not null check (recipient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(recipient_email) <= 254),
  recipient_name text not null default '' check (char_length(recipient_name) <= 160),
  sender_name text not null default '' check (char_length(sender_name) <= 120),
  reply_to_email text check (char_length(reply_to_email) <= 254),
  subject text not null check (char_length(subject) between 1 and 200),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in (
    'queued',
    'sending',
    'sent',
    'delivered',
    'bounced',
    'complained',
    'failed',
    'cancelled'
  )),
  brevo_message_id text check (char_length(brevo_message_id) <= 160),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  next_attempt_at timestamptz not null default now(),
  last_error text check (char_length(last_error) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, case_id) references public.cases (organization_id, id) on delete set null (case_id),
  foreign key (organization_id, created_by) references public.members (organization_id, id) on delete set null (created_by)
);

create index email_outbox_org_status_idx on public.email_outbox (organization_id, status, next_attempt_at);
create index email_outbox_pending_idx on public.email_outbox (next_attempt_at) where status = 'queued';
create index email_outbox_brevo_msg_idx on public.email_outbox (brevo_message_id) where brevo_message_id is not null;

create trigger email_outbox_touch before update on public.email_outbox
for each row execute function private.touch_updated_at();

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon;
revoke insert, update, delete on public.email_outbox from authenticated;
grant select on public.email_outbox to authenticated;

create policy email_outbox_select on public.email_outbox for select to authenticated
  using (organization_id in (select private.member_org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Extension de communication_logs pour refléter le cycle de vie réel des e-mails
alter table public.communication_logs drop constraint communication_logs_status_check;
alter table public.communication_logs
  add constraint communication_logs_status_check check (status in (
    'prepared_manual',
    'logged',
    'queued',
    'sent',
    'delivered',
    'bounced',
    'complained',
    'failed'
  )),
  alter column actor_id drop not null,
  add column email_outbox_id uuid references public.email_outbox (id) on delete set null,
  add column recipient_email text check (char_length(recipient_email) <= 254);

create index communication_logs_outbox_idx on public.communication_logs (email_outbox_id) where email_outbox_id is not null;

-- Autoriser les écritures système dans communication_logs (rappels automatiques ou déclencheurs)
create or replace function private.set_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.importing() or coalesce(current_setting('select_agency.system_email', true), '') = 'on' then
    return new;
  end if;
  new.actor_id := private.member_id(new.organization_id);
  new.at := now();
  if new.actor_id is null then
    raise exception 'Seul un membre de l''agence peut écrire dans son historique.';
  end if;
  return new;
end;
$$;

-- Secrets système (pour le webhook Brevo et le planificateur sans clé service_role) --------------------

create table private.system_secrets (
  key text primary key,
  value text not null check (char_length(value) >= 16),
  updated_at timestamptz not null default now()
);

alter table private.system_secrets enable row level security;
revoke all on private.system_secrets from public, anon, authenticated;

create function private.check_system_secret(p_key text, p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.system_secrets s
    where s.key = p_key and s.value = coalesce(p_secret, '') and char_length(p_secret) >= 16
  );
$$;

-- Fonction centrale d'inscription dans la file d'envoi -------------------------------------------------

create function private.enqueue_email(
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
  v_reply := coalesce(nullif(trim(v_settings.reply_to_email), ''), nullif(trim(v_inv.email), ''), nullif(trim(v_owner_email), ''));

  v_payload := v_payload || jsonb_build_object(
    'agency_name', v_org.name,
    'agency_city', v_org.city,
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

-- 4. Déclencheurs automatiques : paiement confirmé et bienvenue agence ---------------------------------

create function private.enqueue_payment_confirmed_email() returns trigger
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

  select * into v_settings from public.email_settings s where s.organization_id = new.organization_id;
  if found and not v_settings.notify_payment_confirmed then
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

-- Exécuté après payments_snapshot_balance (ordre alphabétique des triggers : payments_z_email_confirmed)
create trigger payments_z_email_confirmed after insert or update of status on public.payments
for each row execute function private.enqueue_payment_confirmed_email();

create function private.enqueue_agency_welcome_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations;
begin
  if private.importing() or new.role <> 'owner' or coalesce(trim(new.email), '') = '' then
    return null;
  end if;
  select * into v_org from public.organizations o where o.id = new.organization_id;
  if not found or v_org.is_demo then
    return null;
  end if;

  perform private.enqueue_email(
    new.organization_id,
    'agency_welcome',
    'agency_welcome:' || new.organization_id::text,
    new.email,
    new.full_name,
    format('Bienvenue sur SELECT Agency — Votre espace %s est prêt', v_org.name),
    jsonb_build_object(
      'owner_name', new.full_name,
      'agency_name', v_org.name,
      'agency_city', v_org.city,
      'currency', v_org.currency
    ),
    null,
    null,
    null,
    null,
    new.id,
    null
  );
  return null;
end;
$$;

create trigger members_welcome_email after insert on public.members
for each row execute function private.enqueue_agency_welcome_email();

-- 5. Inscription d'un e-mail déclenché depuis l'espace agence et traitement de la file ----------------

create function public.queue_agency_email(
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
  if p_kind not in ('document_send', 'missing_documents', 'case_status_changed', 'payment_confirmed') then
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

  return v_outbox_id;
end;
$$;

-- Réclame les e-mails prêts à partir pour l'agence de la personne connectée (atomique : FOR UPDATE SKIP LOCKED).
create function public.claim_agency_emails(p_organization_id uuid, p_limit integer default 10)
returns setof public.email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.removed_at is null
  ) then
    raise exception 'Accès refusé à la file d''envoi de cette agence.';
  end if;

  return query
  with claimed as (
    select e.id
    from public.email_outbox e
    where e.organization_id = p_organization_id
      and (
        (e.status = 'queued' and e.next_attempt_at <= now())
        or (e.status = 'sending' and e.updated_at < now() - interval '2 minutes')
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

-- Enregistre le résultat d'un envoi Brevo pour une ligne de l'agence.
create function public.complete_agency_email(
  p_email_id uuid,
  p_success boolean,
  p_brevo_message_id text default null,
  p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_outbox;
  v_final_status text;
begin
  select * into v_row from public.email_outbox e where e.id = p_email_id for update;
  if not found then
    raise exception 'E-mail introuvable.';
  end if;
  if not exists (
    select 1 from public.members m
    where m.organization_id = v_row.organization_id and m.user_id = auth.uid() and m.removed_at is null
  ) then
    raise exception 'Accès refusé à cet envoi.';
  end if;

  if p_success then
    v_final_status := 'sent';
    update public.email_outbox e set
      status = 'sent',
      brevo_message_id = nullif(trim(coalesce(p_brevo_message_id, '')), ''),
      sent_at = now(),
      last_error = null
    where e.id = v_row.id;
  else
    v_final_status := case when v_row.attempts >= v_row.max_attempts then 'failed' else 'queued' end;
    update public.email_outbox e set
      status = v_final_status,
      last_error = left(trim(coalesce(p_error, 'Erreur d''envoi Brevo')), 500),
      next_attempt_at = now() + (power(2, least(v_row.attempts, 4)) * interval '1 minute')
    where e.id = v_row.id;
  end if;

  update public.communication_logs cl set
    status = v_final_status
  where cl.email_outbox_id = v_row.id;
end;
$$;

-- Variante protégée par secret système pour le planificateur (cron) et le webhook Brevo ---------------

create function public.claim_system_emails(p_secret text, p_limit integer default 25)
returns setof public.email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;

  return query
  with claimed as (
    select e.id
    from public.email_outbox e
    where (
        (e.status = 'queued' and e.next_attempt_at <= now())
        or (e.status = 'sending' and e.updated_at < now() - interval '2 minutes')
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

create function public.complete_system_email(
  p_secret text,
  p_email_id uuid,
  p_success boolean,
  p_brevo_message_id text default null,
  p_error text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_outbox;
  v_final_status text;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;

  select * into v_row from public.email_outbox e where e.id = p_email_id for update;
  if not found then
    return;
  end if;

  if p_success then
    v_final_status := 'sent';
    update public.email_outbox e set
      status = 'sent',
      brevo_message_id = nullif(trim(coalesce(p_brevo_message_id, '')), ''),
      sent_at = now(),
      last_error = null
    where e.id = v_row.id;
  else
    v_final_status := case when v_row.attempts >= v_row.max_attempts then 'failed' else 'queued' end;
    update public.email_outbox e set
      status = v_final_status,
      last_error = left(trim(coalesce(p_error, 'Erreur d''envoi Brevo')), 500),
      next_attempt_at = now() + (power(2, least(v_row.attempts, 4)) * interval '1 minute')
    where e.id = v_row.id;
  end if;

  update public.communication_logs cl set
    status = v_final_status
  where cl.email_outbox_id = v_row.id;
end;
$$;

-- Webhook Brevo : met à jour le statut réel (« delivered », « bounced », « complained ») --------------

create function public.apply_brevo_webhook(
  p_secret text,
  p_brevo_message_id text,
  p_event text,
  p_reason text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_outbox;
  v_event text := lower(trim(coalesce(p_event, '')));
  v_new_status text;
begin
  if not private.check_system_secret('brevo_webhook', p_secret) then
    raise exception 'Secret webhook invalide.' using errcode = '42501';
  end if;

  if coalesce(trim(p_brevo_message_id), '') = '' then
    return false;
  end if;

  select * into v_row from public.email_outbox e
  where e.brevo_message_id = trim(p_brevo_message_id)
  order by e.created_at desc limit 1
  for update;

  if not found then
    return false;
  end if;

  if v_event in ('delivered') then
    v_new_status := 'delivered';
  elsif v_event in ('hard_bounce', 'soft_bounce', 'blocked', 'invalid_email', 'error', 'deferred') then
    v_new_status := 'bounced';
  elsif v_event in ('spam', 'complaint') then
    v_new_status := 'complained';
  elsif v_event = 'unsubscribed' then
    if v_row.client_id is not null then
      update public.clients c set email_opt_out = true, email_opt_out_at = now() where c.id = v_row.client_id;
    end if;
    return true;
  else
    return false;
  end if;

  -- Ne jamais rétrograder un e-mail déjà « delivered » en « sent »
  update public.email_outbox e set
    status = v_new_status,
    delivered_at = case when v_new_status = 'delivered' then coalesce(e.delivered_at, now()) else e.delivered_at end,
    last_error = case when v_new_status in ('bounced', 'complained') then left(coalesce(nullif(trim(p_reason), ''), v_event), 500) else e.last_error end
  where e.id = v_row.id;

  update public.communication_logs cl set
    status = v_new_status
  where cl.email_outbox_id = v_row.id;

  if v_new_status = 'complained' and v_row.client_id is not null then
    update public.clients c set email_opt_out = true, email_opt_out_at = now() where c.id = v_row.client_id;
  end if;

  return true;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function
  private.init_email_settings(),
  private.check_system_secret(text, text),
  private.enqueue_email(uuid, text, text, text, text, text, jsonb, uuid, uuid, uuid, uuid, uuid, text),
  private.enqueue_payment_confirmed_email(),
  private.enqueue_agency_welcome_email()
from public, anon, authenticated;

revoke all on function
  public.save_email_settings(uuid, jsonb),
  public.queue_agency_email(uuid, text, text, uuid, uuid, uuid, text, jsonb, text),
  public.claim_agency_emails(uuid, integer),
  public.complete_agency_email(uuid, boolean, text, text)
from public, anon;

grant execute on function
  public.save_email_settings(uuid, jsonb),
  public.queue_agency_email(uuid, text, text, uuid, uuid, uuid, text, jsonb, text),
  public.claim_agency_emails(uuid, integer),
  public.complete_agency_email(uuid, boolean, text, text)
to authenticated;

revoke all on function
  public.unsubscribe_client_email(uuid, boolean),
  public.claim_system_emails(text, integer),
  public.complete_system_email(text, uuid, boolean, text, text),
  public.apply_brevo_webhook(text, text, text, text)
from public;

grant execute on function
  public.unsubscribe_client_email(uuid, boolean),
  public.claim_system_emails(text, integer),
  public.complete_system_email(text, uuid, boolean, text, text),
  public.apply_brevo_webhook(text, text, text, text)
to anon, authenticated;
