-- SELECT Agency — Trois formules (STARTER, PRO, BUSINESS) et options réservées selon la formule.
--
-- Décision du 6 novembre 2026 :
--   STARTER  (15 000 XAF / mois, 2 membres)  : clients, prospects, dossiers, étapes, pièces, rendez-vous, tâches,
--                                               paiements, reçus, devis, envoi des documents par e-mail.
--   PRO      (30 000 XAF / mois, 5 membres)  : tout STARTER, plus factures, services, partenaires et commissions,
--                                               e-mails automatiques (rappels, relances, avancement), modèles
--                                               d'étapes personnalisés, rapports et exports.
--   BUSINESS (60 000 XAF / mois, illimité)   : tout PRO, plus support prioritaire et nouvelles options en premier.
--
-- Règles :
-- - Pendant le mois d'essai (et dans une démonstration), toutes les options sont ouvertes.
-- - Une formule sans palier (anciennes formules créées dans la console) ouvre toutes les options.
-- - Une agence STARTER ne peut pas CRÉER de nouvelles données dans une option PRO ; ce qui existe déjà reste
--   consultable et modifiable (rien n'est perdu en changeant de formule).
-- - L'application affiche les options non incluses grisées, avec « Passez à PRO » ; la base les refuse aussi.

-- 1. Palier des formules ---------------------------------------------------------------------------------

alter table public.plans
  add column tier text check (tier in ('starter', 'pro', 'business'));

create unique index plans_tier_idx on public.plans (tier) where tier is not null and is_active;

insert into public.plans (name, description, price_minor, currency, billing_period, max_members, is_active, tier, stripe_price_id, stripe_product_id)
values
  ('STARTER', 'Pour démarrer : clients, dossiers, pièces, rendez-vous, paiements, reçus et devis. 2 membres.',
    15000, 'XAF', 'monthly', 2, true, 'starter', 'price_1UYv0TDENw1uRDfuKP8XJlwx', 'prod_Va5AX1I6MKXyB9'),
  ('PRO', 'Tout STARTER, plus factures, services, partenaires, e-mails automatiques, modèles d''étapes et rapports. 5 membres.',
    30000, 'XAF', 'monthly', 5, true, 'pro', 'price_1UYv0UDENw1uRDfueQEZIlf8', 'prod_Va5AIkCawXfZFw'),
  ('BUSINESS', 'Tout PRO, membres illimités, support prioritaire et nouvelles options en premier.',
    60000, 'XAF', 'monthly', null, true, 'business', 'price_1UYv0VDENw1uRDfujuyBG7nb', 'prod_Va5AvY1Cs9kBv8')
on conflict (name) do update set
  description = excluded.description,
  price_minor = excluded.price_minor,
  currency = excluded.currency,
  billing_period = excluded.billing_period,
  max_members = excluded.max_members,
  is_active = true,
  tier = excluded.tier,
  stripe_price_id = excluded.stripe_price_id,
  stripe_product_id = excluded.stripe_product_id;

-- 2. Options de la formule de l'agence -------------------------------------------------------------------

-- Toutes les options réservées sont celles de PRO (BUSINESS ajoute un service, pas une option bloquée).
create function private.org_has_feature(p_org uuid, p_feature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if p_feature not in ('invoices', 'services', 'partners', 'auto_emails', 'custom_workflows', 'reports') then
    raise exception 'Option inconnue : %.', p_feature;
  end if;
  select o.is_demo
      or s.organization_id is null
      or s.status = 'trialing'
      or pl.tier is distinct from 'starter'
    into v_ok
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans pl on pl.id = s.plan_id
  where o.id = p_org;
  return coalesce(v_ok, false);
end;
$$;

create function private.feature_label(p_feature text) returns text
language sql immutable set search_path = '' as $$
  select case p_feature
    when 'invoices' then 'Les factures'
    when 'services' then 'Les services'
    when 'partners' then 'Les partenaires et commissions'
    when 'auto_emails' then 'Les e-mails automatiques'
    when 'custom_workflows' then 'Les modèles d''étapes personnalisés'
    when 'reports' then 'Les rapports et exports'
    else 'Cette option'
  end;
$$;

create function private.require_feature(p_org uuid, p_feature text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.importing() then
    return;
  end if;
  if not private.org_has_feature(p_org, p_feature) then
    raise exception '% : option incluse dans les formules PRO et BUSINESS. Changez de formule dans Paramètres, Abonnement.',
      private.feature_label(p_feature);
  end if;
end;
$$;

-- 3. Blocage dans la base ----------------------------------------------------------------------------------

-- Création d'une donnée d'une option PRO (l'option est passée en argument du déclencheur).
create function private.require_feature_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_feature(new.organization_id, tg_argv[0]);
  return new;
end;
$$;

create trigger invoices_require_feature before insert on public.invoices
for each row execute function private.require_feature_on_insert('invoices');

create trigger services_require_feature before insert on public.services
for each row execute function private.require_feature_on_insert('services');

create trigger service_clients_require_feature before insert on public.service_clients
for each row execute function private.require_feature_on_insert('services');

create trigger service_bookings_require_feature before insert on public.service_bookings
for each row execute function private.require_feature_on_insert('services');

create trigger partners_require_feature before insert on public.partners
for each row execute function private.require_feature_on_insert('partners');

-- Modèles d'étapes : créer ou modifier un modèle personnalisé (revenir au modèle standard reste possible).
create trigger workflow_templates_require_feature before insert or update on public.workflow_templates
for each row execute function private.require_feature_on_insert('custom_workflows');

-- Rattacher un client à un partenaire (le retirer reste possible).
create function private.require_partner_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.partner_id is not null and (tg_op = 'INSERT' or new.partner_id is distinct from old.partner_id) then
    perform private.require_feature(new.organization_id, 'partners');
  end if;
  return new;
end;
$$;

create trigger clients_require_partner_feature before insert or update of partner_id on public.clients
for each row execute function private.require_partner_feature();

-- E-mails automatiques : les activer exige PRO ; les désactiver reste possible.
create function private.require_auto_emails_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.notify_appointment_reminder and (tg_op = 'INSERT' or not old.notify_appointment_reminder))
     or (new.notify_case_status and (tg_op = 'INSERT' or not old.notify_case_status))
     or (new.notify_missing_documents and (tg_op = 'INSERT' or not old.notify_missing_documents)) then
    perform private.require_feature(new.organization_id, 'auto_emails');
  end if;
  return new;
end;
$$;

create trigger email_settings_require_feature before insert or update on public.email_settings
for each row execute function private.require_auto_emails_feature();

-- Une agence passée de l'essai à STARTER garde ses réglages, mais les e-mails automatiques (rappels de
-- rendez-vous, relances automatiques, avancement du dossier) ne sont plus mis en file. Les envois faits à la
-- main (relance des pièces, envoi d'un document) et la confirmation de paiement restent permis.
create function private.skip_automatic_email_without_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('appointment_reminder', 'case_status_changed', 'missing_documents')
     and (new.idempotency_key like 'appointment\_reminder:%'
       or new.idempotency_key like 'case\_status:%'
       or new.idempotency_key like 'missing\_documents:auto:%')
     and not private.org_has_feature(new.organization_id, 'auto_emails') then
    return null;
  end if;
  return new;
end;
$$;

create trigger email_outbox_require_feature before insert on public.email_outbox
for each row execute function private.skip_automatic_email_without_feature();

-- 4. Console : palier visible dans la liste des formules -------------------------------------------------

drop function public.platform_plans();
create function public.platform_plans()
returns table (
  id uuid, name text, description text, price_minor bigint, currency text, billing_period text, max_members integer,
  is_active boolean, subscribers integer, stripe_price_id text, tier text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select p.id, p.name, p.description, p.price_minor, p.currency, p.billing_period, p.max_members, p.is_active,
    (select count(*)::integer from public.subscriptions s where s.plan_id = p.id and s.status in ('trialing', 'active', 'past_due')),
    p.stripe_price_id, p.tier
  from public.plans p
  order by p.is_active desc, p.price_minor, p.name;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function
  private.org_has_feature(uuid, text),
  private.feature_label(text),
  private.require_feature(uuid, text),
  private.require_feature_on_insert(),
  private.require_partner_feature(),
  private.require_auto_emails_feature(),
  private.skip_automatic_email_without_feature()
from public, anon, authenticated;

revoke all on function public.platform_plans() from public, anon;
grant execute on function public.platform_plans() to authenticated;
