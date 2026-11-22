-- Rapport de test v3, point 27 : un prospect devenu client gardait ses relances de prospection ouvertes.
-- Seul le bouton « Transformer en client » les clôturait, depuis l'application ; la conversion automatique
-- (premier dossier ouvert, ajout à un service) les laissait dans Tâches et dans « À traiter aujourd'hui ».
-- La base les termine désormais elle-même, quel que soit le chemin de la conversion.
--
-- Relance de prospection = tâche encore ouverte, liée à la fiche, sans dossier. Les tâches d'un dossier ne
-- sont pas touchées, et rien ne change pour les fiches déjà clientes (aucune donnée existante modifiée).

create function private.close_prospect_follow_ups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks t set status = 'done', completed_at = now()
  where t.organization_id = new.organization_id
    and t.client_id = new.id
    and t.case_id is null
    and t.status in ('todo', 'in_progress');
  return null;
end;
$$;

create trigger clients_close_prospect_follow_ups after update of status on public.clients
for each row when (old.status = 'prospect' and new.status = 'client')
execute function private.close_prospect_follow_ups();
