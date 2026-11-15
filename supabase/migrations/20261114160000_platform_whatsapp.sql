-- Migration Phase 7 : Configuration centralisée de la ligne WhatsApp Cloud API par l'administrateur plateforme

create or replace function public.platform_agency_whatsapp(p_org uuid)
returns table (
  id uuid,
  organization_id uuid,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  status text,
  coexistence boolean,
  quality_rating text,
  messaging_tier text,
  connected_at timestamptz,
  updated_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();

  return query
  select
    a.id,
    a.organization_id,
    a.waba_id,
    a.phone_number_id,
    a.display_phone_number,
    a.verified_name,
    a.status,
    a.coexistence,
    a.quality_rating,
    a.messaging_tier,
    a.connected_at,
    a.updated_at
  from public.wa_accounts a
  where a.organization_id = p_org
  order by a.connected_at desc;
end;
$$;

create or replace function public.platform_configure_agency_whatsapp(
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
  v_existing_id uuid;
begin
  perform private.require_platform_admin();

  select id into v_existing_id
  from public.wa_accounts
  where organization_id = p_org and phone_number_id = trim(p_phone_number_id);

  if v_existing_id is null then
    insert into public.wa_accounts (
      organization_id, waba_id, phone_number_id, display_phone_number,
      verified_name, coexistence, status, quality_rating, messaging_tier,
      connected_by
    ) values (
      p_org, trim(p_waba_id), trim(p_phone_number_id), trim(p_display_phone_number),
      nullif(trim(p_verified_name), ''), coalesce(p_coexistence, false),
      'connected', 'green', 'TIER_1K', (select auth.uid())
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

  insert into private.platform_audit_log (actor_user_id, actor_email, action, organization_id, details)
  values (
    (select auth.uid()),
    coalesce((select email from auth.users where id = (select auth.uid())), 'console'),
    'whatsapp.configured',
    p_org,
    jsonb_build_object(
      'phone_number', trim(p_display_phone_number),
      'phone_number_id', trim(p_phone_number_id),
      'waba_id', trim(p_waba_id)
    )
  );

  return coalesce(v_id, v_existing_id);
end;
$$;

create or replace function public.platform_disconnect_agency_whatsapp(
  p_org uuid,
  p_account_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();

  update public.wa_accounts
  set status = 'disconnected', updated_at = now()
  where id = p_account_id and organization_id = p_org;

  insert into private.platform_audit_log (actor_user_id, actor_email, action, organization_id, details)
  values (
    (select auth.uid()),
    coalesce((select email from auth.users where id = (select auth.uid())), 'console'),
    'whatsapp.disconnected',
    p_org,
    jsonb_build_object('account_id', p_account_id)
  );
end;
$$;

revoke all on function public.platform_agency_whatsapp(uuid) from public, anon;
grant execute on function public.platform_agency_whatsapp(uuid) to authenticated;

revoke all on function public.platform_configure_agency_whatsapp(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.platform_configure_agency_whatsapp(uuid, text, text, text, text, boolean) to authenticated;

revoke all on function public.platform_disconnect_agency_whatsapp(uuid, uuid) from public, anon;
grant execute on function public.platform_disconnect_agency_whatsapp(uuid, uuid) to authenticated;

