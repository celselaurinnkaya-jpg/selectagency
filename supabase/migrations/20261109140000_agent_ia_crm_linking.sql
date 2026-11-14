-- =====================================================================================
-- Migration Phase 7 CRM : Liaison des conversations WhatsApp aux fiches clients et dossiers
-- =====================================================================================

-- 1. Fonction pour lier une conversation WhatsApp à un client (et dossier optionnel) ---

create or replace function public.link_wa_conversation_to_client(
  p_org uuid,
  p_conv_id uuid,
  p_client_id uuid,
  p_case_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_contact_id uuid;
begin
  if not private.has_role(p_org, array['owner', 'admin', 'agent']) then
    raise exception 'Action non autorisée.';
  end if;

  -- Vérifier l'appartenance du client à l'organisation
  if not exists (
    select 1 from public.clients
    where id = p_client_id and organization_id = p_org
  ) then
    raise exception 'Client introuvable dans cette agence.';
  end if;

  -- Vérifier l'appartenance du dossier éventuel
  if p_case_id is not null and not exists (
    select 1 from public.cases
    where id = p_case_id and organization_id = p_org and client_id = p_client_id
  ) then
    raise exception 'Dossier introuvable ou non rattaché à ce client.';
  end if;

  -- Récupérer le contact_id de la conversation
  select contact_id into v_contact_id
  from public.wa_conversations
  where id = p_conv_id and organization_id = p_org;

  if v_contact_id is null then
    raise exception 'Conversation introuvable dans cette agence.';
  end if;

  -- Mettre à jour la conversation
  update public.wa_conversations
  set
    client_id = p_client_id,
    case_id = p_case_id,
    updated_at = now()
  where id = p_conv_id and organization_id = p_org;

  -- Mettre également à jour le contact WhatsApp pour les futurs échanges
  update public.wa_contacts
  set
    client_id = p_client_id,
    updated_at = now()
  where id = v_contact_id and organization_id = p_org;
end;
$$;

-- 2. Fonction pour délier une conversation ---------------------------------------------

create or replace function public.unlink_wa_conversation_from_client(
  p_org uuid,
  p_conv_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_org, array['owner', 'admin', 'agent']) then
    raise exception 'Action non autorisée.';
  end if;

  update public.wa_conversations
  set
    client_id = null,
    case_id = null,
    updated_at = now()
  where id = p_conv_id and organization_id = p_org;
end;
$$;

-- 3. Droits d'exécution ----------------------------------------------------------------

grant execute on function public.link_wa_conversation_to_client(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.unlink_wa_conversation_from_client(uuid, uuid) to authenticated;

