-- SELECT Agency — Index des clés étrangères et alignement sur le projet Supabase.
--
-- Index : recommandés par l'analyse de Supabase (supabase db advisors). Sans eux, supprimer un
-- membre, un client ou un dossier oblige la base à parcourir toute la table qui y fait référence.
-- Les clés composites (organization_id, x) sont couvertes par un index sur les mêmes colonnes.

create index activity_events_actor_idx on public.activity_events (organization_id, actor_id);
create index appointments_assigned_idx on public.appointments (organization_id, assigned_to);
create index case_steps_completed_by_idx on public.case_steps (organization_id, completed_by);
create index client_sensitive_client_idx on public.client_sensitive (organization_id, client_id);
create index communication_logs_actor_idx on public.communication_logs (organization_id, actor_id);
create index communication_logs_case_idx on public.communication_logs (organization_id, case_id);
create index document_requirements_reviewed_by_idx on public.document_requirements (organization_id, reviewed_by);
create index expenses_case_idx on public.expenses (organization_id, case_id);
create index expenses_recorded_by_idx on public.expenses (organization_id, recorded_by);
create index invitations_accepted_by_idx on public.invitations (accepted_by);
create index invitations_invited_by_idx on public.invitations (organization_id, invited_by);
create index organizations_created_by_idx on public.organizations (created_by);
create index payment_allocations_payment_idx on public.payment_allocations (organization_id, payment_id);
create index payments_received_by_idx on public.payments (organization_id, received_by);
create index tasks_assigned_idx on public.tasks (organization_id, assigned_to);
create index tasks_client_idx on public.tasks (organization_id, client_id);

-- La RLS a été activée à la main sur le projet pour les compteurs : on l'inscrit ici pour que les
-- migrations décrivent exactement la base. Aucune règle n'est créée : seules les fonctions
-- « security definer » (propriétaire de la table) lisent et écrivent les compteurs.
alter table private.counters enable row level security;
