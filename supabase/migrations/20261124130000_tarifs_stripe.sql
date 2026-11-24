-- Paiement par carte rétabli (demande de l'utilisateur du 24/11/2026) : nouveaux tarifs Stripe, créés le même jour
-- dans le compte Stripe réel avec son accord, aux nouveaux prix (migration 20261124120000) : mensuels, en FCFA,
-- sous les produits existants. Les anciens tarifs (15 000, 30 000, 60 000 FCFA) restent dans Stripe, inutilisés.
-- Chaque formule n'est reliée que si son prix est bien celui du nouveau tarif.

update public.plans p set stripe_price_id = n.price_id
from (values
  ('starter', 7500, 'price_1UfK8CDENw1uRDfuKK7w6sSu'),
  ('pro', 10500, 'price_1UfK8EDENw1uRDfuaru9ces4'),
  ('business', 15500, 'price_1UfK8FDENw1uRDfuEiHL6FXS')
) as n(tier, price_minor, price_id)
where p.tier = n.tier and p.is_active and p.price_minor = n.price_minor and p.currency = 'XAF' and p.billing_period = 'monthly';

-- Trace dans le journal de la console.
insert into private.platform_audit_log (actor_email, action, details)
select '', 'plan.stripe', jsonb_build_object(
  'plan_id', p.id,
  'plan', p.name,
  'stripe_price_id', p.stripe_price_id,
  'source', 'database',
  'reason', 'Nouveau tarif Stripe au nouveau prix : paiement par carte rétabli (migration 20261124130000).'
)
from public.plans p
where p.tier in ('starter', 'pro', 'business') and p.is_active and p.stripe_price_id in (
  'price_1UfK8CDENw1uRDfuKK7w6sSu', 'price_1UfK8EDENw1uRDfuaru9ces4', 'price_1UfK8FDENw1uRDfuEiHL6FXS'
);
