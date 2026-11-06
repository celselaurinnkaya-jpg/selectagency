import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { BILLING_PERIOD } from "@/lib/domain/labels";
import { formatDate, formatMoney, minorUnits } from "@/lib/format";
import { PlanForm } from "@/features/admin/AdminForms";
import { agencyStatus, CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listAgencies, listPlans } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Formules et abonnements" };

export default function PlansPage() {
  return (
    <>
      <PageHeader
        title="Formules et abonnements"
        description="Les formules proposées aux agences et l'état de chaque abonnement. Les agences voient les formules actives dans leur page Abonnement."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Plans />
      </Suspense>
    </>
  );
}

/** Prix en unités mineures → saisie du formulaire (« 15000 », « 99.90 »). */
const priceInput = (minor: number, currency: string) => {
  const digits = minorUnits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits);
};

async function Plans() {
  const [plans, agencies] = await Promise.all([listPlans(), listAgencies()]);
  const now = new Date();
  const subscribed = agencies.filter((a) => !a.isDemo);
  return (
    <div className="space-y-6">
      <Section title="Formules">
        {plans.length === 0 && (
          <div className="mb-3">
            <Notice tone="warning" title="Aucune formule">
              Créez au moins une formule pour que les agences voient vos tarifs. Les prix affichés sont exactement ceux saisis ici.
            </Notice>
          </div>
        )}
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-navy-800">
                    {plan.name} · <span className="tabular-nums">{formatMoney(plan.priceMinor, plan.currency)}</span> {BILLING_PERIOD[plan.billingPeriod].per}
                  </p>
                  <span className="flex flex-wrap gap-1.5">
                    <StatusBadge spec={plan.isActive ? { label: "Proposée", tone: "success" } : { label: "Retirée de l'offre", tone: "neutral" }} />
                    <StatusBadge spec={{ label: `${plan.subscribers} agence(s)`, tone: "navy" }} />
                  </span>
                </div>
                <details>
                  <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-medium text-navy-700">Modifier</summary>
                  <div className="mt-3">
                    <PlanForm
                      plan={{
                        id: plan.id,
                        name: plan.name,
                        description: plan.description,
                        price: priceInput(plan.priceMinor, plan.currency),
                        currency: plan.currency,
                        billingPeriod: plan.billingPeriod,
                        maxMembers: plan.maxMembers ? String(plan.maxMembers) : "",
                        isActive: plan.isActive,
                        stripePriceId: plan.stripePriceId ?? "",
                      }}
                    />
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
        <Card className="mt-3">
          <p className="mb-3 font-medium text-navy-800">Nouvelle formule</p>
          <PlanForm />
        </Card>
      </Section>

      <Section title="Abonnements des agences">
        <ul className="space-y-2">
          {subscribed.map((agency) => {
            const { spec, attention } = agencyStatus(agency, now);
            return (
              <li key={agency.id}>
                <Link href={`/admin/agences/${agency.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                  <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{agency.name}</span>
                      <span className="block text-xs text-slate-500">
                        {agency.planName ?? "Sans formule"}
                        {agency.trialEndsAt && agency.status === "trialing" && ` · essai jusqu'au ${formatDate(agency.trialEndsAt, CONSOLE_TIMEZONE)}`}
                        {agency.currentPeriodEnd && ` · échéance ${formatDate(agency.currentPeriodEnd, CONSOLE_TIMEZONE)}`}
                        {attention && ` · ${attention}`}
                      </span>
                    </span>
                    <StatusBadge spec={spec} />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
