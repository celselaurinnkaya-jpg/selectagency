-- =====================================================================================
-- Migration Phase 5 : Connexion WhatsApp officielle et traitement des messages
-- Embedded Signup, comptes WhatsApp (wa_accounts) et webhooks Meta
-- =====================================================================================

-- 0. Horodatages d'accusé de réception sur les messages WhatsApp -----------------------

alter table public.wa_messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

-- 1. Fonction pour connecter ou mettre à jour un compte WhatsApp Business ---------------

create or replace function public.connect_wa_account(
  p_org uuid,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_verified_name text default null,
  p_coexistence boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_plan_wa integer;
  v_current_count integer;
  v_existing_id uuid;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent connecter un numéro WhatsApp.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');

  -- Vérifier si le numéro existe déjà pour cette organisation
  select id into v_existing_id
  from public.wa_accounts
  where organization_id = p_org and phone_number_id = trim(p_phone_number_id);

  if v_existing_id is null then
    -- Vérification du quota de la formule
    select coalesce(pl.max_wa_numbers, 1) into v_plan_wa
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.organization_id = p_org;

    select count(*) into v_current_count
    from public.wa_accounts
    where organization_id = p_org and status = 'connected';

    if v_plan_wa is not null and v_current_count >= v_plan_wa then
      raise exception 'Limite de numéros WhatsApp atteinte pour votre formule (% max).', v_plan_wa;
    end if;

    insert into public.wa_accounts (
      organization_id, waba_id, phone_number_id, display_phone_number,
      verified_name, coexistence, status, quality_rating, messaging_tier,
      connected_by
    ) values (
      p_org, trim(p_waba_id), trim(p_phone_number_id), trim(p_display_phone_number),
      nullif(trim(p_verified_name), ''), coalesce(p_coexistence, false),
      'connected', 'green', 'TIER_1K', auth.uid()
    ) returning id into v_id;
  else
    update public.wa_accounts
    set
      waba_id = trim(p_waba_id),
      display_phone_number = trim(p_display_phone_number),
      verified_name = nullif(trim(p_verified_name), ''),
      coexistence = coalesce(p_coexistence, coexistence),
      status = 'connected',
      last_error = null,
      updated_at = now()
    where id = v_existing_id and organization_id = p_org
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- 2. Fonction pour déconnecter un compte WhatsApp -------------------------------------

create or replace function public.disconnect_wa_account(
  p_account_id uuid,
  p_org uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Action réservée aux administrateurs.';
  end if;

  update public.wa_accounts
  set status = 'disconnected', updated_at = now()
  where id = p_account_id and organization_id = p_org;
end;
$$;

-- 3. Ingestion d'un message entrant reçu par le Webhook Meta ---------------------------

create or replace function public.record_inbound_wa_message(
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
  v_contact_id uuid;
  v_conv_id uuid;
  v_default_agent_id uuid;
  v_mode text;
  v_agent_record record;
begin
  -- 1. Trouver le compte WhatsApp rattaché à ce numéro
  select id, organization_id into v_account
  from public.wa_accounts
  where phone_number_id = p_phone_number_id and status = 'connected';

  if v_account.id is null then
    return jsonb_build_object('ok', false, 'reason', 'Numéro de réception inconnu ou inactif.');
  end if;

  -- 2. Trouver ou créer le contact
  insert into public.wa_contacts (
    organization_id, wa_id, profile_name, last_incoming_at
  ) values (
    v_account.organization_id, p_sender_wa_id, nullif(trim(p_sender_name), ''), p_timestamp
  )
  on conflict (organization_id, wa_id) do update
  set
    profile_name = coalesce(nullif(trim(p_sender_name), ''), public.wa_contacts.profile_name),
    last_incoming_at = p_timestamp,
    updated_at = now()
  returning id into v_contact_id;

  -- 3. Trouver un agent actif par défaut pour l'agence
  select id into v_default_agent_id
  from public.ai_agents
  where organization_id = v_account.organization_id and is_active = true
  order by created_at asc
  limit 1;

  -- 4. Trouver ou ouvrir la conversation
  select id, mode into v_conv_id, v_mode
  from public.wa_conversations
  where organization_id = v_account.organization_id
    and account_id = v_account.id
    and contact_id = v_contact_id;

  if v_conv_id is null then
    v_mode := 'ai';
    insert into public.wa_conversations (
      organization_id, account_id, contact_id, agent_id, mode, status,
      unread_count, last_message_text, last_message_at
    ) values (
      v_account.organization_id, v_account.id, v_contact_id, v_default_agent_id,
      v_mode, 'open', 1, p_message_text, p_timestamp
    ) returning id into v_conv_id;
  else
    update public.wa_conversations
    set
      unread_count = unread_count + 1,
      last_message_text = p_message_text,
      last_message_at = p_timestamp,
      status = 'open',
      updated_at = now()
    where id = v_conv_id;
  end if;

  -- 5. Enregistrer le message
  insert into public.wa_messages (
    organization_id, conversation_id, direction, meta_message_id,
    kind, body, author_kind, status, created_at
  ) values (
    v_account.organization_id, v_conv_id, 'inbound', p_meta_message_id,
    'text', coalesce(p_message_text, ''), 'contact', 'delivered', p_timestamp
  );

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_conv_id,
    'mode', v_mode,
    'agent_id', v_default_agent_id,
    'organization_id', v_account.organization_id
  );
end;
$$;

-- 4. Mise à jour des accusés de réception (sent, delivered, read) -----------------------

create or replace function public.update_wa_message_status(
  p_meta_message_id text,
  p_status text,
  p_timestamp timestamptz default now()
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.wa_messages
  set
    status = p_status,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, p_timestamp) else delivered_at end,
    read_at = case when p_status = 'read' then coalesce(read_at, p_timestamp) else read_at end,
    updated_at = now()
  where meta_message_id = p_meta_message_id;

  return found;
end;
$$;

-- 5. Droits d'exécution ----------------------------------------------------------------

grant execute on function public.connect_wa_account(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.disconnect_wa_account(uuid, uuid) to authenticated;
grant execute on function public.record_inbound_wa_message(text, text, text, text, text, timestamptz) to authenticated, anon;
grant execute on function public.update_wa_message_status(text, text, timestamptz) to authenticated, anon;
