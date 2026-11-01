import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { METHOD_KIND } from "@/lib/domain/labels";
import { dayKey, formatDate, formatMoney } from "@/lib/format";
import { CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listPayments } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Paiements des abonnements" };

export default function SubscriptionPaymentsPage() {
  return (
    <>
      <PageHeader
        title="Paiements des abonnements"
        description="Les sommes reçues par SELECT de la part des agences. Un paiement s'enregistre depuis la fiche de l'agence concernée."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Payments />
      </Suspense>
    </>
  );
}

async function Payments() {
  const payments = await listPayments();
  const now = new Date();
  const month = dayKey(now, CONSOLE_TIMEZONE).slice(0, 7);
  const recorded = payments.filter((p) => p.status === "recorded");
  const totals = (list: typeof recorded) => {
    const map = new Map<string, number>();
    for (const p of list) map.set(p.currency, (map.get(p.currency) ?? 0) + p.amountMinor);
    return [...map.entries()].map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") || "—";
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reçu ce mois-ci" value={<span className="text-base">{totals(recorded.filter((p) => dayKey(p.paidAt, CONSOLE_TIMEZONE).startsWith(month)))}</span>} icon={Wallet} tone="success" />
        <StatCard label="Reçu au total" value={<span className="text-base">{totals(recorded)}</span>} icon={Wallet} />
        <StatCard label="Paiements" value={recorded.length} icon={Wallet} />
        <StatCard label="Annulés" value={payments.length - recorded.length} icon={Wallet} />
      </div>
      <Section title="Historique">
        {payments.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucun paiement enregistré" description="Ouvrez la fiche d'une agence pour enregistrer le paiement de son abonnement." />
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <Link href={`/admin/agences/${p.organizationId}`} className="block truncate font-medium text-navy-700 hover:underline">
                      {p.organizationName}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {formatDate(p.paidAt, CONSOLE_TIMEZONE)} · {METHOD_KIND[p.methodKind]}
                      {p.transactionReference && ` · réf. ${p.transactionReference}`}
                      {p.planName && ` · ${p.planName}`}
                      {p.periodEnd && ` · jusqu'au ${formatDate(p.periodEnd, CONSOLE_TIMEZONE)}`}
                    </span>
                    {p.status === "voided" && <span className="block text-xs text-slate-600">Annulé : {p.voidReason}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</span>
                    {p.status === "voided" && <StatusBadge spec={{ label: "Annulé", tone: "neutral" }} />}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
