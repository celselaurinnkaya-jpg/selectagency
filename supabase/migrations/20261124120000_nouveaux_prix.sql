-- Nouveaux prix des formules (demande de l'utilisateur du 24/11/2026), en FCFA par mois :
-- STARTER 7 500 (au lieu de 15 000), PRO 10 500 (au lieu de 30 000), BUSINESS 15 500 (au lieu de 60 000).
-- L'équivalent en dollars américains est affiché par l'application au taux du jour ; la facturation reste en FCFA.
--
-- Stripe : le montant d'un tarif Stripe ne peut pas être modifié. Les anciens tarifs (15 000, 30 000 et
-- 60 000 FCFA) sont donc détachés des formules, pour qu'aucune carte ne soit débitée de l'ancien montant. Le
-- paiement par carte d'une formule reprend dès que son nouveau tarif Stripe est enregistré dans la console
-- (Formules et abonnements), qui vérifie qu'il correspond exactement au nouveau prix. En attendant : Mobile Money,
-- espèces ou virement, enregistrés par SELECT.

update public.plans p set
  price_minor = n.price_minor,
  currency = 'XAF',
  billing_period = 'monthly',
  stripe_price_id = null
from (values ('starter', 7500), ('pro', 10500), ('business', 15500)) as n(tier, price_minor)
where p.tier = n.tier and p.is_active;

-- Trace dans le journal de la console (changement fait par migration, hors console).
insert into private.platform_audit_log (actor_email, action, details)
select '', 'plan.updated', jsonb_build_object(
  'plan', p.name,
  'source', 'database',
  'reason', format('Nouveau prix : %s FCFA par mois (migration 20261124120000). Ancien tarif Stripe détaché : nouveau tarif à enregistrer pour le paiement par carte.', n.label)
)
from public.plans p
join (values ('starter', '7 500'), ('pro', '10 500'), ('business', '15 500')) as n(tier, label) on n.tier = p.tier
where p.is_active;
