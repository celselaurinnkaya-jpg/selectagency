-- Sécurité S4 : une agence de démonstration n'est utilisable que 7 jours.
--
-- Constat (audit du 3 novembre 2026, confirmé sur le projet de test) : n'importe quel compte pouvait créer, par
-- l'API, une agence « démonstration ». Elle n'a pas d'abonnement et restait modifiable sans limite de temps :
-- un accès gratuit et illimité à l'application.
--
-- Désormais, une démonstration accepte de nouvelles données pendant 7 jours après sa création, puis passe en
-- consultation seulement (comme un essai terminé). Son propriétaire peut toujours la quitter (« Quitter la
-- démonstration et créer mon agence » : leave_demo_organization ne dépend pas de ce droit d'écriture).

create or replace function private.org_can_write(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (o.is_demo and o.created_at > now() - interval '7 days')
      or s.status in ('active', 'past_due')
      or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
    from public.organizations o
    left join public.subscriptions s on s.organization_id = o.id
    where o.id = p_org
  ), false);
$$;

revoke all on function private.org_can_write(uuid) from public, anon, authenticated;
