-- Connexion WhatsApp par le vrai QR code de Meta (Embedded Signup, « WhatsApp Business app onboarding ») et
-- boîte WhatsApp Web alimentée par les conversations du téléphone.
--
-- 1. connect_wa_account : plus de qualité « verte » ni de palier « TIER_1K » inventés (ils viennent de Meta) ;
--    pendant l'essai et la démonstration, quota de numéros de la formule PRO (comme private.ai_limits).
-- 2. Jeton d'accès Meta du numéro (« business token » obtenu à la fin du scan) : rangé chiffré dans le schéma
--    privé, lu et écrit seulement par le serveur de SELECT (secret serveur). Jamais lisible depuis le navigateur.
-- 3. Historique et messages envoyés depuis le téléphone (champs « history » et « smb_message_echoes » du
--    webhook) : enregistrés dans la boîte, sans compter de non-lus et sans déclencher de réponse de l'IA.
--    Un message envoyé depuis le téléphone par l'agence fait passer la conversation en mode « Conseiller ».

-- 1. Connexion d'un numéro ------------------------------------------------------------------------------------

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
  v_max integer;
  v_count integer;
begin
  if not private.has_role(p_org, array['owner', 'admin']) then
    raise exception 'Seuls le propriétaire et les administrateurs peuvent connecter un numéro WhatsApp.';
  end if;
  perform private.require_feature(p_org, 'ai_agent');

  select id into v_id from public.wa_accounts where organization_id = p_org and phone_number_id = trim(p_phone_number_id);

  if v_id is null then
    select
      case when o.is_demo or s.organization_id is null or s.status = 'trialing'
        then greatest(coalesce(pl.max_wa_numbers, 0), coalesce(pro.n, 0)) else coalesce(pl.max_wa_numbers, 0) end
      into v_max
    from public.organizations o
    left join public.subscriptions s on s.organization_id = o.id
    left join public.plans pl on pl.id = s.plan_id
    cross join (select max(p.max_wa_numbers) as n from public.plans p where p.tier = 'pro') pro
    where o.id = p_org;

    select count(*) into v_count from public.wa_accounts where organization_id = p_org and status = 'connected';
    if v_count >= coalesce(v_max, 0) then
      raise exception 'Limite de numéros WhatsApp atteinte pour votre formule (% max).', coalesce(v_max, 0);
    end if;

    insert into public.wa_accounts (organization_id, waba_id, phone_number_id, display_phone_number, verified_name, coexistence, status, connected_by)
    values (p_org, trim(p_waba_id), trim(p_phone_number_id), trim(p_display_phone_number), nullif(trim(p_verified_name), ''),
      coalesce(p_coexistence, false), 'connected', auth.uid())
    returning id into v_id;
  else
    update public.wa_accounts set
      waba_id = trim(p_waba_id),
      display_phone_number = trim(p_display_phone_number),
      verified_name = nullif(trim(p_verified_name), ''),
      coexistence = coalesce(p_coexistence, coexistence),
      status = 'connected',
      last_error = null,
      connected_by = auth.uid(),
      connected_at = now(),
      updated_at = now()
    where id = v_id and organization_id = p_org;
  end if;
  return v_id;
end;
$$;

-- 2. Jeton d'accès Meta du numéro --------------------------------------------------------------------------------

create table private.wa_account_tokens (
  account_id uuid primary key references public.wa_accounts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Chiffré par le serveur (AES-256-GCM) : la base ne voit jamais le jeton en clair.
  token_enc text not null check (char_length(token_enc) between 20 and 4000),
  updated_at timestamptz not null default now()
);
alter table private.wa_account_tokens enable row level security;
revoke all on private.wa_account_tokens from public, anon, authenticated;

create function public.save_wa_account_token(p_secret text, p_org uuid, p_phone_number_id text, p_token_enc text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_account uuid;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  select id into v_account from public.wa_accounts where organization_id = p_org and phone_number_id = p_phone_number_id;
  if v_account is null then
    return false;
  end if;
  insert into private.wa_account_tokens (account_id, organization_id, token_enc) values (v_account, p_org, p_token_enc)
  on conflict (account_id) do update set token_enc = excluded.token_enc, updated_at = now();
  return true;
end;
$$;

create function public.wa_account_token(p_secret text, p_phone_number_id text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  return (
    select t.token_enc from private.wa_account_tokens t
    join public.wa_accounts a on a.id = t.account_id
    where a.phone_number_id = p_phone_number_id and a.status = 'connected'
  );
end;
$$;

-- 3. Historique et messages envoyés depuis le téléphone ----------------------------------------------------------

create function public.record_wa_history_message(
  p_secret text,
  p_phone_number_id text,
  p_contact_wa_id text,
  p_contact_name text,
  p_direction text,
  p_meta_message_id text,
  p_kind text,
  p_text text,
  p_timestamp timestamptz,
  p_from_phone_app boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_account record;
  v_contact uuid;
  v_conv uuid;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  if p_direction not in ('inbound', 'outbound') or coalesce(p_kind, 'text') not in ('text', 'image', 'document', 'audio') then
    return jsonb_build_object('ok', false, 'reason', 'type');
  end if;
  if char_length(coalesce(p_contact_wa_id, '')) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'reason', 'contact');
  end if;
  if p_meta_message_id is not null and exists (select 1 from public.wa_messages m where m.meta_message_id = p_meta_message_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select id, organization_id into v_account from public.wa_accounts where phone_number_id = p_phone_number_id and status = 'connected';
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'reason', 'account');
  end if;

  insert into public.wa_contacts (organization_id, wa_id, profile_name)
  values (v_account.organization_id, p_contact_wa_id, nullif(left(trim(coalesce(p_contact_name, '')), 160), ''))
  on conflict (organization_id, wa_id) do update set
    profile_name = coalesce(nullif(left(trim(coalesce(p_contact_name, '')), 160), ''), public.wa_contacts.profile_name),
    updated_at = now()
  returning id into v_contact;

  insert into public.wa_conversations (organization_id, account_id, contact_id, agent_id, mode, status, unread_count, last_message_text, last_message_at)
  values (
    v_account.organization_id, v_account.id, v_contact,
    (select ag.id from public.ai_agents ag where ag.organization_id = v_account.organization_id and ag.is_active order by ag.created_at limit 1),
    'ai', 'open', 0, left(coalesce(p_text, ''), 4096), coalesce(p_timestamp, now())
  )
  on conflict (account_id, contact_id) do nothing;
  select id into v_conv from public.wa_conversations where account_id = v_account.id and contact_id = v_contact;

  insert into public.wa_messages (organization_id, conversation_id, direction, meta_message_id, kind, body, author_kind, status, created_at)
  values (
    v_account.organization_id, v_conv, p_direction, p_meta_message_id, coalesce(p_kind, 'text'), left(coalesce(p_text, ''), 4096),
    case when p_direction = 'inbound' then 'contact' else 'member' end,
    case when p_direction = 'inbound' then 'delivered' else 'sent' end,
    coalesce(p_timestamp, now())
  );

  update public.wa_conversations set
    last_message_text = case when coalesce(p_timestamp, now()) >= last_message_at then left(coalesce(p_text, ''), 4096) else last_message_text end,
    last_message_at = greatest(last_message_at, coalesce(p_timestamp, now())),
    -- L'agence répond depuis son téléphone : l'IA se tait dans cette conversation.
    mode = case when p_from_phone_app and p_direction = 'outbound' then 'human' else mode end,
    updated_at = now()
  where id = v_conv;

  return jsonb_build_object('ok', true, 'conversation_id', v_conv);
end;
$$;

revoke all on function public.save_wa_account_token(text, uuid, text, text) from public;
revoke all on function public.wa_account_token(text, text) from public;
revoke all on function public.record_wa_history_message(text, text, text, text, text, text, text, text, timestamptz, boolean) from public;
grant execute on function public.save_wa_account_token(text, uuid, text, text) to anon, authenticated;
grant execute on function public.wa_account_token(text, text) to anon, authenticated;
grant execute on function public.record_wa_history_message(text, text, text, text, text, text, text, text, timestamptz, boolean) to anon, authenticated;

-- 4. Noms des contacts du téléphone (champ « smb_app_state_sync ») --------------------------------------------

create function public.record_wa_contact(p_secret text, p_phone_number_id text, p_contact_wa_id text, p_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  select organization_id into v_org from public.wa_accounts where phone_number_id = p_phone_number_id and status = 'connected';
  if v_org is null or char_length(coalesce(p_contact_wa_id, '')) not between 1 and 60 or nullif(trim(coalesce(p_name, '')), '') is null then
    return false;
  end if;
  insert into public.wa_contacts (organization_id, wa_id, profile_name)
  values (v_org, p_contact_wa_id, left(trim(p_name), 160))
  on conflict (organization_id, wa_id) do update set profile_name = excluded.profile_name, updated_at = now();
  return true;
end;
$$;

revoke all on function public.record_wa_contact(text, text, text, text) from public;
grant execute on function public.record_wa_contact(text, text, text, text) to anon, authenticated;
