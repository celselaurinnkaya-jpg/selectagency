-- SELECT Agency — Sécurité : RLS sur toutes les tables, droits par rôle.
--
-- Rôles (voir src/lib/domain/labels.ts) :
--   lecture      : tous les membres de l'agence, sauf la finance (pas pour « lecture seule ») ;
--   « opérations » (clients, dossiers, pièces, agenda, tâches) : owner, admin, agent ;
--   « finance » (prestations, dépenses, événements) : owner, admin, agent, accountant ;
--   paramètres et invitations : owner, admin.
-- Les paiements ne s'écrivent que par la fonction record_payment (contrôles et numéro de reçu).
-- Le rôle anon (visiteur non connecté) n'a accès à aucune table.

alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.invitations enable row level security;
alter table public.clients enable row level security;
alter table public.client_sensitive enable row level security;
alter table public.cases enable row level security;
alter table public.case_steps enable row level security;
alter table public.document_requirements enable row level security;
alter table public.appointments enable row level security;
alter table public.tasks enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.activity_events enable row level security;
alter table public.communication_logs enable row level security;

-- Droits explicites (certains projets n'exposent plus les nouvelles tables automatiquement) : la
-- personne connectée peut adresser les tables, la RLS décide ensuite ligne par ligne.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on private.counters from public, anon, authenticated;

-- Lecture : tout membre de l'agence -------------------------------------------------------------

create policy organizations_select on public.organizations for select to authenticated
  using (id in (select private.my_org_ids()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'clients', 'cases', 'case_steps', 'document_requirements', 'appointments', 'tasks',
    'activity_events', 'communication_logs'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (organization_id in (select private.my_org_ids()))',
      t
    );
  end loop;
  -- Le rôle « lecture seule » ne voit pas la finance.
  foreach t in array array['charges', 'payments', 'payment_allocations', 'expenses'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent'', ''accountant''])))',
      t
    );
  end loop;
end;
$$;

-- Opérations : propriétaire, administrateur, conseiller -------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'client_sensitive', 'cases', 'case_steps', 'document_requirements', 'appointments', 'tasks'] loop
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent''])))',
      t
    );
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent''])))
         with check (organization_id in (select private.org_ids_with_role(array[''owner'', ''admin'', ''agent''])))',
      t
    );
  end loop;
end;
$$;

-- Numéro complet de la pièce d'identité : ni le comptable ni la lecture seule.
create policy client_sensitive_select on public.client_sensitive for select to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));

create policy tasks_delete on public.tasks for delete to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));
create policy appointments_delete on public.appointments for delete to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));

-- Supprimer une fiche client : réservé aux responsables. La base refuse de toute façon la
-- suppression d'un client qui a des dossiers (clé étrangère) : il faut alors l'archiver.
create policy clients_delete on public.clients for delete to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])));

create policy communication_logs_insert on public.communication_logs for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent'])));

-- Finance et historique -------------------------------------------------------------------------

create policy charges_insert on public.charges for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

create policy expenses_insert on public.expenses for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

create policy activity_events_insert on public.activity_events for insert to authenticated
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin', 'agent', 'accountant'])));

-- Paramètres de l'agence et invitations ---------------------------------------------------------

create policy organizations_update on public.organizations for update to authenticated
  using (id in (select private.org_ids_with_role(array['owner', 'admin'])))
  with check (id in (select private.org_ids_with_role(array['owner', 'admin'])));

create policy invitations_select on public.invitations for select to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])));

create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    organization_id in (select private.org_ids_with_role(array['owner', 'admin']))
    and invited_by = private.member_id(organization_id)
    and accepted_at is null
  );

-- Mise à jour = annulation d'une invitation en attente.
create policy invitations_update on public.invitations for update to authenticated
  using (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])) and accepted_at is null)
  with check (organization_id in (select private.org_ids_with_role(array['owner', 'admin'])) and accepted_at is null);

-- Droits d'exécution des fonctions d'aide ---------------------------------------------------------

revoke all on all functions in schema private from public;
grant execute on function
  private.my_org_ids(),
  private.org_ids_with_role(text[]),
  private.has_role(uuid, text[]),
  private.member_id(uuid),
  private.importing()
to authenticated;
