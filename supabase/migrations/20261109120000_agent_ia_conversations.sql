-- =====================================================================================
-- Migration Phase 6 : Boîte de réception WhatsApp, envoi manuel et lecture
-- =====================================================================================

-- 1. Fonction pour envoyer un message manuel depuis la boîte de réception --------------

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
    raise exception 'Action non autorisée.';
  end if;

  select id into v_member_id
  from public.members
  where organization_id = p_org and user_id = auth.uid();

  -- Insérer le message sortant
  insert into public.wa_messages (
    organization_id, conversation_id, direction, kind, body,
    author_kind, member_id, status
  ) values (
    p_org, p_conv_id, 'outbound', 'text', trim(p_body),
    'member', v_member_id, 'sent'
  ) returning id into v_message_id;

  -- Mettre à jour la conversation
  update public.wa_conversations
  set
    last_message_text = trim(p_body),
    last_message_at = now(),
    unread_count = 0,
    updated_at = now()
  where id = p_conv_id and organization_id = p_org;

  return v_message_id;
end;
$$;

-- 2. Fonction pour marquer une conversation comme lue ----------------------------------

create or replace function public.mark_wa_conversation_read(
  p_conv_id uuid,
  p_org uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.wa_conversations
  set unread_count = 0, updated_at = now()
  where id = p_conv_id and organization_id = p_org;
end;
$$;

-- 3. Droits d'exécution ----------------------------------------------------------------

grant execute on function public.send_wa_outbound_message(uuid, uuid, text) to authenticated;
grant execute on function public.mark_wa_conversation_read(uuid, uuid) to authenticated;

