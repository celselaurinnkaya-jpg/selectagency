import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, Check, CreditCard, LifeBuoy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { FEATURE_LABEL, lockedFeatures, TIER_INCLUDES } from "@/lib/domain/features";
import { BILLING_PERIOD, METHOD_KIND, SUBSCRIPTION_STATUS } from "@/lib/domain/labels";
import { daysLeft, effectiveStatus } from "@/lib/domain/subscription";
import { formatDate, formatMoney } from "@/lib/format";
import { getBilling } from "@/features/billing/queries";
import { CardCheckoutButton, CardPortalButton } from "@/features/billing/StripeButtons";
import { SettingsNav } from "@/features/settings/SettingsNav";
import { isStripeConfigured } from "@/lib/stripe/server";

export const metadata: Metadata = { title: "Abonnement" };

export default function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  return (
    <>
      <PageHeader title="Paramètres" description="Abonnement de l'agence à SELECT Agency, formules et paiements." />
      <SettingsNav active="abonnement" />
      <Suspense fallback={<PageSkeleton />}>
        <Billing searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Billing({ searchParams }: { searchParams: PageProps<"/settings/billing">["searchParams"] }) {
  const query = await searchParams;
  const billing = await getBilling();
  if (billing.isDemo) {
    return <Notice title="Agence de démonstration">Une agence de démonstration n&apos;a pas d&apos;abonnement : elle sert uniquement à découvrir l&apos;application.</Notice>;
  }
  if (!billing.canRead) {
    return <Notice>Seuls le propriétaire et les administrateurs de l&apos;agence consultent l&apos;abonnement.</Notice>;
  }
  const { subscription, plans, payments, memberCount, now, agency } = billing;
  const tz = agency.timezone;
  if (!subscription) {
    return <Notice tone="warning">Aucun abonnement n&apos;est enregistré pour cette agence. Écrivez au support SELECT.</Notice>;
  }
  const status = effectiveStatus(subscription, now);
  const limit = subscription.plan?.maxMembers;
  const deadline = status === "trialing" || status === "trial_expired" ? subscription.trialEndsAt : subscription.currentPeriodEnd;
  // Paiement par carte (Stripe) : abonnement en cours → gestion de la carte ; sinon, une formule à payer.
  const cardReady = isStripeConfigured();
  const cardOngoing = Boolean(subscription.stripeSubscriptionId) && (subscription.status === "active" || subscription.status === "past_due");
  const locked = lockedFeatures(false, subscription);
  const paid = query.paiement === "ok";
  const cancelled = query.paiement === "annule";

  return (
    <div className="space-y-6">
      {paid && (
        <Notice tone="success" title="Paiement reçu par Stripe">
          Votre abonnement s&apos;active dans quelques secondes. Si le statut ci-dessous n&apos;a pas encore changé, rechargez la page.
        </Notice>
      )}
      {cancelled && <Notice title="Paiement annulé">Aucun montant n&apos;a été débité. Vous pouvez choisir une formule quand vous le souhaitez.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Statut" value={<StatusBadge spec={SUBSCRIPTION_STATUS[status]} className="text-sm" />} icon={CreditCard} />
        <StatCard label="Formule" value={<span className="text-base">{subscription.plan?.name ?? (status === "trialing" ? "Essai gratuit" : "Non définie")}</span>} icon={CreditCard} />
        <StatCard
          label={status === "trialing" || status === "trial_expired" ? "Fin de l'essai" : "Prochaine échéance"}
          value={<span className="text-base">{deadline ? formatDate(deadline, tz) : "—"}</span>}
          hint={deadline && status !== "trial_expired" ? `dans ${daysLeft(deadline, now)} jour(s)` : undefined}
          icon={CalendarClock}
          tone={status === "trial_expired" || status === "suspended" ? "danger" : "navy"}
        />
        <StatCard label="Membres" value={limit ? `${memberCount} / ${limit}` : memberCount} hint={limit ? "places de la formule" : "sans limite de membres"} icon={Users} />
      </div>

      {status === "trialing" && (
        <Notice title="Pendant l'essai, toutes les options sont ouvertes">
          À la fin de l&apos;essai, choisissez votre formule : STARTER pour l&apos;essentiel, PRO pour les factures, services, partenaires,
          e-mails automatiques, modèles d&apos;étapes et rapports, BUSINESS pour une équipe sans limite.
        </Notice>
      )}
      {locked.length > 0 && (
        <Notice title="Formule STARTER">
          Options non incluses (grisées dans l&apos;application) : {locked.map((f) => FEATURE_LABEL[f]).join(", ")}. Passez à PRO pour les
          ouvrir ; vos données déjà enregistrées restent consultables.
        </Notice>
      )}
      {!billing.writable && (
        <Notice tone="warning" title="Agence en lecture seule">
          Toutes vos données restent consultables, mais rien de nouveau ne peut être enregistré tant que l&apos;abonnement n&apos;est pas activé.
        </Notice>
      )}

      <Section title="Activer ou changer de formule">
        <Card className="space-y-4">
          <p className="text-sm text-slate-700">
            {cardOngoing
              ? "Votre abonnement est payé par carte et se renouvelle automatiquement à chaque échéance. Changez de carte, de formule ou résiliez depuis la page sécurisée de Stripe."
              : cardReady
                ? "Payez votre abonnement par carte bancaire (Visa, Mastercard) sur la page sécurisée de Stripe : il s'active aussitôt. Vous pouvez aussi payer par Mobile Money ou virement auprès de l'équipe SELECT."
                : "Le paiement de l'abonnement se fait auprès de l'équipe SELECT (Mobile Money ou virement) : écrivez-nous depuis le support en indiquant la formule choisie."}
          </p>
          <div className="flex flex-wrap items-start gap-3">
            {cardReady && subscription.stripeCustomerId && <CardPortalButton />}
            <Button asChild variant="outline">
              <Link href="/support?categorie=billing#nouvelle-demande">
                <LifeBuoy aria-hidden />
                Payer par Mobile Money ou virement
              </Link>
            </Button>
          </div>
        </Card>
        {plans.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Card className="flex h-full flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-navy-800">{plan.name}</p>
                      {subscription.plan?.id === plan.id && <StatusBadge spec={{ label: "Votre formule", tone: "navy" }} />}
                    </div>
                    <p className="text-xl font-semibold tabular-nums text-slate-900">
                      {formatMoney(plan.priceMinor, plan.currency)} <span className="text-sm font-normal text-slate-500">{BILLING_PERIOD[plan.billingPeriod].per}</span>
                    </p>
                    {plan.tier ? (
                      <ul className="space-y-1.5 text-sm text-slate-700">
                        {TIER_INCLUDES[plan.tier].map((line) => (
                          <li key={line} className="flex gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      plan.description && <p className="text-sm text-slate-600">{plan.description}</p>
                    )}
                    <p className="text-sm font-medium text-slate-700">{plan.maxMembers ? `Jusqu'à ${plan.maxMembers} membres` : "Membres illimités"}</p>
                  </div>
                  {cardReady && !cardOngoing && (
                    <div>
                      {plan.stripePriceId ? (
                        <CardCheckoutButton planId={plan.id} planName={plan.name} />
                      ) : (
                        <p className="text-xs text-slate-500">Paiement par carte bientôt disponible pour cette formule.</p>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Les formules seront bientôt publiées : contactez le support pour connaître les tarifs.</p>
        )}
      </Section>

      <Section title="Paiements de l'abonnement">
        {payments.length === 0 ? (
          <EmptyState icon={CreditCard} title="Aucun paiement enregistré" description="Les paiements reçus par SELECT pour votre abonnement apparaîtront ici." />
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(p.paidAt, tz)} · {METHOD_KIND[p.methodKind]}
                      {p.transactionReference && ` · réf. ${p.transactionReference}`}
                      {p.periodEnd && ` · abonnement jusqu'au ${formatDate(p.periodEnd, tz)}`}
                    </span>
                  </span>
                  {p.status === "voided" && <StatusBadge spec={{ label: "Annulé", tone: "neutral" }} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
