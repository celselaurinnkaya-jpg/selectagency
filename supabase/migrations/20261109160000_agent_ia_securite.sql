-- Agent IA : corrections de sécurité avant la première mise en base (revue du 9 novembre 2026).
--
-- 1. Les membres n'écrivent plus directement dans les tables WhatsApp. Avant, n'importe quel membre (même en
--    lecture seule, même avec un abonnement suspendu) pouvait insérer un faux message, un faux numéro WhatsApp
--    (sans quota) ou modifier une conversation. Tout passe désormais par des fonctions contrôlées.
-- 2. Les messages entrants et les accusés de Meta ne sont acceptés qu'avec le secret serveur de SELECT, vérifié
--    par son empreinte, comme pour Stripe et les e-mails. Avant, n'importe qui sur Internet pouvait, avec la clé
--    publique, déposer un faux message dans la boîte d'une agence ou changer un statut.
-- 3. Un message que Meta envoie deux fois n'est enregistré qu'une fois ; un accusé ne fait jamais reculer un
--    statut (« lu » ne redevient pas « livré »).
-- 4. Un message écrit par un conseiller reste « en attente » tant que Meta ne l'a pas accepté (le statut ne
--    s'invente pas), et il ne peut viser qu'une conversation de sa propre agence.

-- 1. Plus d'écriture directe -------------------------------------------------------------------------------

revoke insert, update, delete on public.wa_accounts, public.wa_contacts, public.wa_conversations, public.wa_messages
  from authenticated, anon;

drop policy if exists wa_accounts_insert on public.wa_accounts;
drop policy if exists wa_contacts_insert on public.wa_contacts;
drop policy if exists wa_conversations_insert on public.wa_conversations;
drop policy if exists wa_conversations_update on public.wa_conversations;
drop policy if exists wa_messages_insert on public.wa_messages;

-- 2 et 3. Événements de Meta : secret serveur obligatoire --------------------------------------------------

drop function if exists public.record_inbound_wa_message(text, text, text, text, text, timestamptz);
drop function if exists public.update_wa_message_status(text, text, timestamptz);

create function public.record_inbound_wa_message(
  p_secret text,
  p_phone_number_id text,
  p_sender_wa_id text,
  p_sender_name text,
  p_meta_message_id text,
  p_message_text text,
  p_timestamp timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_account record;
  v_existing record;
  v_contact_id uuid;
  v_conv_id uuid;
  v_default_agent_id uuid;
  v_mode text;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;

  -- Déjà reçu : Meta renvoie parfois le même message.
  if p_meta_message_id is not null then
    select m.conversation_id, m.organization_id into v_existing
    from public.wa_messages m where m.meta_message_id = p_meta_message_id;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'conversation_id', v_existing.conversation_id,
        'organization_id', v_existing.organization_id);
    end if;
  end if;

  select id, organization_id into v_account
  from public.wa_accounts
  where phone_number_id = p_phone_number_id and status = 'connected';
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'reason', 'Numéro de réception inconnu ou inactif.');
  end if;

  insert into public.wa_contacts (organization_id, wa_id, profile_name, last_incoming_at)
  values (v_account.organization_id, p_sender_wa_id, nullif(trim(p_sender_name), ''), p_timestamp)
  on conflict (organization_id, wa_id) do update set
    profile_name = coalesce(nullif(trim(p_sender_name), ''), public.wa_contacts.profile_name),
    last_incoming_at = p_timestamp,
    updated_at = now()
  returning id into v_contact_id;

  select id into v_default_agent_id
  from public.ai_agents
  where organization_id = v_account.organization_id and is_active = true
  order by created_at asc
  limit 1;

  select id, mode into v_conv_id, v_mode
  from public.wa_conversations
  where organization_id = v_account.organization_id and account_id = v_account.id and contact_id = v_contact_id;

  if v_conv_id is null then
    v_mode := 'ai';
    insert into public.wa_conversations (
      organization_id, account_id, contact_id, agent_id, mode, status, unread_count, last_message_text, last_message_at
    ) values (
      v_account.organization_id, v_account.id, v_contact_id, v_default_agent_id, v_mode, 'open', 1, p_message_text, p_timestamp
    ) returning id into v_conv_id;
  else
    update public.wa_conversations set
      unread_count = unread_count + 1,
      last_message_text = p_message_text,
      last_message_at = p_timestamp,
      status = 'open',
      updated_at = now()
    where id = v_conv_id;
  end if;

  insert into public.wa_messages (
    organization_id, conversation_id, direction, meta_message_id, kind, body, author_kind, status, created_at
  ) values (
    v_account.organization_id, v_conv_id, 'inbound', p_meta_message_id, 'text', coalesce(p_message_text, ''), 'contact', 'delivered', p_timestamp
  );

  return jsonb_build_object('ok', true, 'conversation_id', v_conv_id, 'mode', v_mode, 'agent_id', v_default_agent_id,
    'organization_id', v_account.organization_id);
end;
$$;

create function public.update_wa_message_status(
  p_secret text,
  p_meta_message_id text,
  p_status text,
  p_timestamp timestamptz default now()
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_order constant text[] := array['queued', 'sent', 'delivered', 'read'];
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'read', 'failed') then
    return false;
  end if;

  update public.wa_messages set
    status = p_status,
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_timestamp) else delivered_at end,
    read_at = case when p_status = 'read' then coalesce(read_at, p_timestamp) else read_at end,
    updated_at = now()
  where meta_message_id = p_meta_message_id
    and case
      -- un échec ne remplace qu'un message pas encore distribué ; « échoué » est définitif
      when p_status = 'failed' then status in ('queued', 'sent')
      else array_position(v_order, status) < array_position(v_order, p_status)
    end;
  return found;
end;
$$;

-- 4. Message écrit par un conseiller ------------------------------------------------------------------------

create or replace function public.send_wa_outbound_message(
  p_org uuid,
  p_conv_id uuid,
  p_body text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_message_id uuid;
  v_member_id uuid;
begin
  if not private.has_role(p_org, array['owner', 'admin', 'agent']) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4096 then
    raise exception 'Le message doit contenir entre 1 et 4 096 caractères.';
  end if;
  if not exists (select 1 from public.wa_conversations c where c.id = p_conv_id and c.organization_id = p_org) then
    raise exception 'Conversation introuvable dans cette agence.';
  end if;

  select id into v_member_id from public.members where organization_id = p_org and user_id = auth.uid();

  -- « En attente » jusqu'à l'accord de Meta : le statut « envoyé » n'est posé qu'avec l'identifiant de Meta.
  insert into public.wa_messages (organization_id, conversation_id, direction, kind, body, author_kind, member_id, status)
  values (p_org, p_conv_id, 'outbound', 'text', trim(p_body), 'member', v_member_id, 'queued')
  returning id into v_message_id;

  update public.wa_conversations set
    last_message_text = trim(p_body),
    last_message_at = now(),
    unread_count = 0,
    updated_at = now()
  where id = p_conv_id and organization_id = p_org;

  return v_message_id;
end;
$$;

-- Appelée par le serveur de SELECT (secret) quand Meta a accepté le message et donné son identifiant.
create function public.mark_wa_message_sent(p_secret text, p_message_id uuid, p_meta_message_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_meta_message_id, '')) not between 1 and 160 then
    raise exception 'Identifiant Meta invalide.';
  end if;
  update public.wa_messages set meta_message_id = p_meta_message_id, status = 'sent', updated_at = now()
  where id = p_message_id and direction = 'outbound' and status = 'queued' and meta_message_id is null;
  return found;
end;
$$;

-- Droits ---------------------------------------------------------------------------------------------------
-- Les fonctions à secret sont appelées avec la clé publique (rôle anon) : le secret fait la barrière.

revoke all on function public.record_inbound_wa_message(text, text, text, text, text, text, timestamptz) from public;
revoke all on function public.update_wa_message_status(text, text, text, timestamptz) from public;
revoke all on function public.mark_wa_message_sent(text, uuid, text) from public;
grant execute on function public.record_inbound_wa_message(text, text, text, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.update_wa_message_status(text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.mark_wa_message_sent(text, uuid, text) to anon, authenticated;
grant execute on function public.send_wa_outbound_message(uuid, uuid, text) to authenticated;
