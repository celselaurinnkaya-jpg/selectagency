-- SELECT Agency — Équipe : changer un rôle, retirer un collaborateur, transférer la propriété.
--
-- Les membres ne s'écrivent toujours pas directement (aucune politique d'écriture) : ces fonctions
-- vérifient elles-mêmes le rôle de la personne connectée. Un membre retiré n'est pas supprimé, car
-- son nom reste dans l'historique et sur les reçus : son compte est détaché (user_id vide) et perd
-- l'accès aussitôt, puisque toutes les règles RLS relisent la table des membres à chaque requête.
-- La gestion de l'équipe reste possible quand l'abonnement est suspendu : retirer l'accès d'une
-- personne qui a quitté l'agence ne doit jamais être bloqué.

alter table public.members add column removed_at timestamptz;

create index members_active_idx on public.members (organization_id) where removed_at is null;

-- Changer le rôle d'un membre. Le rôle de propriétaire ne s'attribue que par transfert.
create function public.update_member_role(p_member_id uuid, p_role text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target public.members;
  v_actor public.members;
begin
  select * into v_target from public.members m where m.id = p_member_id and m.removed_at is null for update;
  if found then
    select * into v_actor from public.members m
    where m.organization_id = v_target.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'admin');
  end if;
  if v_actor.id is null then
    raise exception 'Membre introuvable, ou action réservée aux responsables de l''agence.';
  end if;
  if p_role is null or p_role not in ('admin', 'agent', 'accountant', 'viewer') then
    raise exception 'Rôle inconnu. Le rôle de propriétaire se transmet par un transfert de propriété.';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'Vous ne pouvez pas changer votre propre rôle : demandez-le à un autre responsable.';
  end if;
  if v_target.role = 'owner' then
    raise exception 'Le rôle du propriétaire ne change que par un transfert de propriété.';
  end if;

  update public.members m set role = p_role where m.id = v_target.id;
  insert into public.activity_events (organization_id, actor_id, text) values (v_target.organization_id, v_actor.id, p_event);
end;
$$;

-- Retirer un membre : ses clients, dossiers en cours, tâches ouvertes et rendez-vous à venir sont
-- confiés à un autre membre, ses invitations en attente sont annulées, puis son compte est détaché.
create function public.remove_member(p_member_id uuid, p_reassign_to uuid, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target public.members;
  v_actor public.members;
  v_heir public.members;
  v_org uuid;
begin
  select * into v_target from public.members m where m.id = p_member_id and m.removed_at is null for update;
  if found then
    select * into v_actor from public.members m
    where m.organization_id = v_target.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'admin');
  end if;
  if v_actor.id is null then
    raise exception 'Membre introuvable, ou action réservée aux responsables de l''agence.';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'Vous ne pouvez pas vous retirer vous-même de l''agence.';
  end if;
  if v_target.role = 'owner' then
    raise exception 'Le propriétaire ne peut pas être retiré : transférez d''abord la propriété de l''agence.';
  end if;

  v_org := v_target.organization_id;
  select * into v_heir from public.members m
  where m.id = p_reassign_to and m.organization_id = v_org and m.removed_at is null
    and m.id <> v_target.id and m.role in ('owner', 'admin', 'agent');
  if v_heir.id is null then
    raise exception 'Choisissez la personne qui reprend ses clients, ses dossiers et ses tâches en cours.';
  end if;

  update public.clients c set assigned_to = v_heir.id where c.organization_id = v_org and c.assigned_to = v_target.id;
  update public.cases c set assigned_to = v_heir.id
  where c.organization_id = v_org and c.assigned_to = v_target.id and c.status in ('active', 'on_hold');
  update public.tasks t set assigned_to = v_heir.id
  where t.organization_id = v_org and t.assigned_to = v_target.id and t.status in ('todo', 'in_progress');
  update public.appointments a set assigned_to = v_heir.id
  where a.organization_id = v_org and a.assigned_to = v_target.id and a.status in ('planned', 'awaiting_confirmation', 'confirmed');
  update public.invitations i set revoked_at = now()
  where i.organization_id = v_org and i.invited_by = v_target.id and i.accepted_at is null and i.revoked_at is null;

  update public.members m set user_id = null, removed_at = now() where m.id = v_target.id;
  insert into public.activity_events (organization_id, actor_id, text) values (v_org, v_actor.id, p_event);
end;
$$;

-- Transmettre la propriété : la personne choisie devient propriétaire, l'ancien propriétaire
-- devient administrateur. Seul le propriétaire peut le faire, et seulement vers un vrai compte.
create function public.transfer_ownership(p_member_id uuid, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target public.members;
  v_actor public.members;
begin
  select * into v_target from public.members m where m.id = p_member_id and m.removed_at is null for update;
  if found then
    select * into v_actor from public.members m
    where m.organization_id = v_target.organization_id and m.user_id = auth.uid() and m.role = 'owner'
    for update;
  end if;
  if v_actor.id is null then
    raise exception 'Membre introuvable, ou action réservée au propriétaire de l''agence.';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'Vous êtes déjà propriétaire de l''agence.';
  end if;
  if v_target.user_id is null then
    raise exception 'Ce membre n''a pas de compte : la propriété ne peut pas lui être transmise.';
  end if;

  update public.members m set role = 'owner' where m.id = v_target.id;
  update public.members m set role = 'admin' where m.id = v_actor.id;
  insert into public.activity_events (organization_id, actor_id, text) values (v_target.organization_id, v_actor.id, p_event);
end;
$$;

revoke all on function
  public.update_member_role(uuid, text, text),
  public.remove_member(uuid, uuid, text),
  public.transfer_ownership(uuid, text)
from public, anon;

grant execute on function
  public.update_member_role(uuid, text, text),
  public.remove_member(uuid, uuid, text),
  public.transfer_ownership(uuid, text)
to authenticated;

-- Paramètres de l'agence : seules ces colonnes sont modifiables par l'agence. « is_demo » et
-- « created_by » ne le sont plus : marquer une vraie agence comme démonstration permettait de la
-- faire supprimer par le bouton « Quitter la démonstration ».
revoke update on public.organizations from authenticated;
grant update (name, city, currency, timezone, receipt_prefix) on public.organizations to authenticated;
