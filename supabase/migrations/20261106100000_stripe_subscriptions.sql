-- SELECT Agency — Abonnements des agences payés par carte avec Stripe.
--
-- Règle de l'abonnement (inchangée) : à l'ouverture du compte, 1 mois d'essai gratuit ; ensuite l'agence paie son
-- abonnement, sinon elle reste consultable mais ne peut plus rien enregistrer (private.org_can_write).
-- Stripe Checkout encaisse la carte ; le webhook Stripe (signature vérifiée par l'application) appelle ces
-- fonctions avec le secret serveur de SELECT (le même que la tâche quotidienne : clé « email_worker »).
--
-- 1. Formules : tarif Stripe (price_…) associé par la console SELECT.
-- 2. Abonnements : client et abonnement Stripe de l'agence, reliés par le webhook signé (jamais par l'agence :
--    une agence en fin d'essai, en consultation seulement, doit pouvoir payer).
-- 3. Paiements : chaque facture Stripe n'est enregistrée qu'une fois (Stripe renvoie parfois le même message).
-- 4. Statut : suit l'abonnement Stripe (payé, en retard, résilié).

-- 1. Formules -------------------------------------------------------------------------------------------

alter table public.plans
  add column stripe_price_id text check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  add column stripe_product_id text check (stripe_product_id ~ '^prod_[A-Za-z0-9]+$');

create unique index plans_stripe_price_idx on public.plans (stripe_price_id) where stripe_price_id is not null;

-- La console SELECT associe (ou retire) le tarif Stripe d'une formule. L'application a vérifié auprès de Stripe
-- que le tarif existe, qu'il est récurrent et qu'il correspond au prix, à la devise et à la périodicité.
create function public.platform_set_plan_stripe(p_plan_id uuid, p_stripe_price_id text, p_stripe_product_id text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  update public.plans set
    stripe_price_id = nullif(trim(coalesce(p_stripe_price_id, '')), ''),
    stripe_product_id = nullif(trim(coalesce(p_stripe_product_id, '')), '')
  where id = p_plan_id;
  if not found then
    raise exception 'Formule introuvable.';
  end if;
  perform private.log_platform_action(
    'plan.stripe',
    null,
    jsonb_build_object('plan_id', p_plan_id, 'stripe_price_id', nullif(trim(coalesce(p_stripe_price_id, '')), ''))
  );
end;
$$;

-- La console affiche le tarif Stripe de chaque formule.
drop function public.platform_plans();
create function public.platform_plans()
returns table (
  id uuid, name text, description text, price_minor bigint, currency text, billing_period text, max_members integer,
  is_active boolean, subscribers integer, stripe_price_id text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return query
  select p.id, p.name, p.description, p.price_minor, p.currency, p.billing_period, p.max_members, p.is_active,
    (select count(*)::integer from public.subscriptions s where s.plan_id = p.id and s.status in ('trialing', 'active', 'past_due')),
    p.stripe_price_id
  from public.plans p
  order by p.is_active desc, p.price_minor, p.name;
end;
$$;
revoke all on function public.platform_plans() from public, anon;
grant execute on function public.platform_plans() to authenticated;

-- 2. Abonnements ----------------------------------------------------------------------------------------

alter table public.subscriptions
  add column stripe_customer_id text check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  add column stripe_subscription_id text check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$');

create unique index subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id) where stripe_customer_id is not null;
create unique index subscriptions_stripe_subscription_idx on public.subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;

-- Agence d'un message Stripe : par son abonnement, son client, ou l'agence notée dans les métadonnées posées par
-- l'application au moment du paiement (message signé par Stripe). Relie au passage les identifiants manquants.
create function private.stripe_organization(
  p_subscription_id text,
  p_customer_id text,
  p_organization_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_sub text := nullif(trim(coalesce(p_subscription_id, '')), '');
  v_cus text := nullif(trim(coalesce(p_customer_id, '')), '');
begin
  if v_sub is not null then
    select s.organization_id into v_org from public.subscriptions s where s.stripe_subscription_id = v_sub;
  end if;
  if v_org is null and v_cus is not null then
    select s.organization_id into v_org from public.subscriptions s where s.stripe_customer_id = v_cus;
  end if;
  -- L'agence notée dans le message doit être celle du client ou de l'abonnement déjà connus : sinon, refus.
  if v_org is not null and p_organization_id is not null and v_org <> p_organization_id then
    raise exception 'Ce client Stripe appartient à une autre agence.';
  end if;
  if v_org is null and p_organization_id is not null then
    select s.organization_id into v_org from public.subscriptions s where s.organization_id = p_organization_id;
  end if;
  if v_org is null then
    return null;
  end if;

  -- Un client ou un abonnement Stripe déjà rattaché à une AUTRE agence n'est jamais déplacé.
  if (v_cus is not null and exists (select 1 from public.subscriptions s where s.stripe_customer_id = v_cus and s.organization_id <> v_org))
     or (v_sub is not null and exists (select 1 from public.subscriptions s where s.stripe_subscription_id = v_sub and s.organization_id <> v_org)) then
    raise exception 'Ce client Stripe appartient à une autre agence.';
  end if;

  update public.subscriptions s set
    stripe_customer_id = coalesce(s.stripe_customer_id, v_cus),
    stripe_subscription_id = coalesce(v_sub, s.stripe_subscription_id),
    updated_at = now()
  where s.organization_id = v_org;
  return v_org;
end;
$$;

-- Paiement terminé (Checkout) : relie le client et l'abonnement Stripe à l'agence. Le paiement lui-même est
-- enregistré par la facture (stripe_record_invoice).
create function public.stripe_link_checkout(p_secret text, p_organization_id uuid, p_customer_id text, p_subscription_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  v_org := private.stripe_organization(p_subscription_id, p_customer_id, p_organization_id);
  if v_org is null then
    raise exception 'Agence introuvable pour ce paiement Stripe.';
  end if;
  return true;
end;
$$;

-- 3. Paiements ------------------------------------------------------------------------------------------

alter table public.subscription_payments
  add column stripe_invoice_id text check (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$');

create unique index subscription_payments_stripe_invoice_idx on public.subscription_payments (stripe_invoice_id) where stripe_invoice_id is not null;

alter table public.subscription_payments drop constraint subscription_payments_method_kind_check;
alter table public.subscription_payments
  add constraint subscription_payments_method_kind_check check (method_kind in ('cash', 'bank_transfer', 'mobile_money', 'card', 'other'));

-- Facture Stripe payée : abonnement actif jusqu'à la fin de la période payée, paiement inscrit une seule fois.
-- Renvoie « recorded », « duplicate » (déjà enregistrée) ou « no_charge » (facture à 0, période seulement).
-- Agence introuvable : erreur, pour que Stripe renvoie le message plus tard (le lien peut arriver après).
create function public.stripe_record_invoice(
  p_secret text,
  p_invoice_id text,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_amount_minor bigint,
  p_currency text,
  p_period_end timestamptz,
  p_number text default null,
  p_organization_id uuid default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_plan uuid;
  v_invoice text := nullif(trim(coalesce(p_invoice_id, '')), '');
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  if v_invoice is null then
    raise exception 'Facture Stripe sans identifiant.';
  end if;
  if exists (select 1 from public.subscription_payments p where p.stripe_invoice_id = v_invoice) then
    return 'duplicate';
  end if;

  v_org := private.stripe_organization(p_subscription_id, p_customer_id, p_organization_id);
  if v_org is null then
    raise exception 'Agence introuvable pour cette facture Stripe.';
  end if;
  select pl.id into v_plan from public.plans pl where pl.stripe_price_id = nullif(trim(coalesce(p_price_id, '')), '');

  update public.subscriptions s set
    status = 'active',
    plan_id = coalesce(v_plan, s.plan_id),
    current_period_end = case
      when p_period_end is null then s.current_period_end
      else greatest(p_period_end, coalesce(s.current_period_end, p_period_end))
    end,
    updated_at = now()
  where s.organization_id = v_org;

  if coalesce(p_amount_minor, 0) <= 0 then
    return 'no_charge';
  end if;

  insert into public.subscription_payments (
    organization_id, plan_id, amount_minor, currency, method_kind, transaction_reference,
    paid_at, period_end, status, stripe_invoice_id
  ) values (
    v_org, v_plan, p_amount_minor, upper(trim(p_currency)), 'card',
    left('Carte (Stripe) ' || coalesce(nullif(trim(p_number), ''), v_invoice), 80),
    now(), p_period_end, 'recorded', v_invoice
  );
  return 'recorded';
end;
$$;

-- 4. Statut de l'abonnement -----------------------------------------------------------------------------

-- Suit l'abonnement Stripe. « incomplete » et « incomplete_expired » (paiement jamais abouti) ne changent rien :
-- l'agence garde son statut (essai, ou consultation seulement si l'essai est terminé).
-- Le tarif de l'abonnement donne la formule : un changement de formule fait depuis la page Stripe (portail)
-- s'applique dès le message de Stripe, sans attendre la facture suivante.
create function public.stripe_sync_subscription(
  p_secret text,
  p_subscription_id text,
  p_customer_id text,
  p_status text,
  p_period_end timestamptz,
  p_organization_id uuid default null,
  p_price_id text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_status text;
  v_plan uuid;
begin
  if not private.check_system_secret('email_worker', p_secret) then
    raise exception 'Secret système invalide.' using errcode = '42501';
  end if;
  v_status := case trim(coalesce(p_status, ''))
    when 'active' then 'active'
    when 'trialing' then 'active'
    when 'past_due' then 'past_due'
    when 'unpaid' then 'past_due'
    when 'canceled' then 'cancelled'
    when 'paused' then 'suspended'
    else null
  end;
  if v_status is null then
    return false;
  end if;

  v_org := private.stripe_organization(p_subscription_id, p_customer_id, p_organization_id);
  if v_org is null then
    return false;
  end if;

  select pl.id into v_plan from public.plans pl where pl.stripe_price_id = nullif(trim(coalesce(p_price_id, '')), '');

  update public.subscriptions s set
    status = v_status,
    plan_id = coalesce(v_plan, s.plan_id),
    current_period_end = coalesce(p_period_end, s.current_period_end),
    updated_at = now()
  where s.organization_id = v_org;
  return true;
end;
$$;

-- Droits d'exécution -----------------------------------------------------------------------------------

revoke all on function private.stripe_organization(text, text, uuid) from public, anon, authenticated;

revoke all on function public.platform_set_plan_stripe(uuid, text, text) from public, anon;
grant execute on function public.platform_set_plan_stripe(uuid, text, text) to authenticated;

revoke all on function
  public.stripe_link_checkout(text, uuid, text, text),
  public.stripe_record_invoice(text, text, text, text, text, bigint, text, timestamptz, text, uuid),
  public.stripe_sync_subscription(text, text, text, text, timestamptz, uuid, text)
from public;
grant execute on function
  public.stripe_link_checkout(text, uuid, text, text),
  public.stripe_record_invoice(text, text, text, text, text, bigint, text, timestamptz, text, uuid),
  public.stripe_sync_subscription(text, text, text, text, timestamptz, uuid, text)
to anon, authenticated;
