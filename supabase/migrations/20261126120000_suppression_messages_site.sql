-- SELECT Agency — Suppression des messages reçus par le site (demande de l'utilisateur du 26/11).
--
-- La page « Messages reçus par le site » permet de cocher un ou plusieurs messages et de les supprimer d'un coup.
-- Supprimer un message l'enlève seulement de la liste : la fiche prospect et la tâche « Rappeler » restent.
-- Mêmes personnes que pour « traité » : propriétaire, administrateurs et conseillers, dans leurs bureaux.

-- Le message est-il modifiable par la personne connectée ? (rôle, agence en écriture, visibilité par bureau)
create function private.can_manage_website_message(p_message public.website_messages) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(p_message.organization_id, array['owner', 'admin', 'agent'])
    and coalesce(
      p_message.organization_id not in (select private.my_restricted_org_ids())
      or (p_message.client_id is not null and p_message.client_id in (select private.restricted_visible_client_ids()))
      or (p_message.client_id is null and (p_message.bureau_id is null or p_message.bureau_id in (select private.my_bureau_ids()))),
      false
    );
$$;

revoke all on function private.can_manage_website_message(public.website_messages) from public, anon, authenticated;

-- « Traité » / « à traiter » : même règle, désormais écrite une seule fois.
create or replace function public.set_website_message_handled(p_id uuid, p_handled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_message public.website_messages;
begin
  select * into v_message from public.website_messages m where m.id = p_id for update;
  if not found or not private.can_manage_website_message(v_message) then
    raise exception 'Message introuvable, ou vous n''avez pas le droit de le modifier.';
  end if;
  update public.website_messages m set
    handled_at = case when coalesce(p_handled, false) then coalesce(m.handled_at, now()) end,
    handled_by = case when coalesce(p_handled, false) then coalesce(m.handled_by, private.member_id(v_message.organization_id)) end
  where m.id = p_id;
end;
$$;

-- Supprime les messages cochés (tous ou aucun) ; renvoie le nombre de messages supprimés.
create function public.delete_website_messages(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Cochez au moins un message.';
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'Trop de messages à la fois : 500 au plus.';
  end if;
  if exists (
    select 1
    from unnest(p_ids) as x (id)
    left join public.website_messages m on m.id = x.id
    where m.id is null or not private.can_manage_website_message(m)
  ) then
    raise exception 'Message introuvable, ou vous n''avez pas le droit de le supprimer.';
  end if;
  delete from public.website_messages m where m.id = any (p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.delete_website_messages(uuid[]) from public, anon;
grant execute on function public.delete_website_messages(uuid[]) to authenticated;
