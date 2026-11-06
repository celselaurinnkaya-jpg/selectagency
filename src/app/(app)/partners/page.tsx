import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Handshake, Plus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared/ui";
import { formatMoney } from "@/lib/format";
import { getShell } from "@/features/operations/queries";
import { listPartners } from "@/features/partners/queries";

export const metadata: Metadata = { title: "Partenaires" };

const money = (list: { currency: string; amountMinor: number }[]) => (list.length ? list.map((t) => formatMoney(t.amountMinor, t.currency)).join(" · ") : "0");

export default function PartnersPage() {
  return (
    <>
      <PageHeader
        title="Partenaires"
        description="Les personnes et structures qui vous envoient des clients. Chacune a un code, que le client donne à son arrivée : ses clients et ses commissions se suivent ici."
        actions={
          <Button asChild variant="accent">
            <Link href="/partners/new">
              <Plus aria-hidden />
              Nouveau partenaire
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Partners />
      </Suspense>
    </>
  );
}

async function Partners() {
  const [{ partners, totals, canSeeCommissions }, { locked: lockedFeatures }] = await Promise.all([listPartners(), getShell()]);
  const locked = lockedFeatures.includes("partners");
  return (
    <div className="space-y-6">
      {locked && (
        <FeatureLocked feature="partners">
          Votre formule STARTER garde vos partenaires et leurs commissions consultables, mais ne permet plus d&apos;en créer ni de
          leur rattacher de nouveaux clients.
        </FeatureLocked>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Partenaires actifs" value={totals.active} hint={`${partners.length} au total`} icon={Handshake} />
        <StatCard label="Clients apportés" value={totals.clients} hint="Tous partenaires confondus" icon={Users} />
        {canSeeCommissions && (
          <>
            <StatCard label="Commissions à payer" value={<span className="text-base">{money(totals.toPay)}</span>} hint="Clients qui ont payé" icon={Wallet} tone={totals.toPay.length ? "warning" : "navy"} />
            <StatCard label="Versées ce mois-ci" value={<span className="text-base">{money(totals.paidThisMonth)}</span>} hint="Commissions payées" icon={CheckCircle2} tone="success" />
          </>
        )}
      </div>

      {partners.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="Aucun partenaire pour le moment"
          description={
            locked
              ? "Les partenaires sont inclus dans les formules PRO et BUSINESS."
              : "Créez un partenaire, donnez-lui son code : chaque client qui arrive avec ce code lui sera rattaché."
          }
          action={
            locked ? undefined : (
              <Button asChild variant="accent">
                <Link href="/partners/new">Créer un partenaire</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {partners.map(({ partner, clients, toPay, paid }) => (
            <li key={partner.id}>
              <Link href={`/partners/${partner.id}`} className="block h-full rounded-xl transition hover:ring-2 hover:ring-navy-200">
                <Card className="h-full space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-navy-800">{partner.name}</span>
                      <span className="mt-1 inline-block rounded-md bg-surface px-2 py-0.5 font-mono text-xs text-slate-800">{partner.code}</span>
                    </span>
                    {!partner.isActive && <StatusBadge spec={{ label: "Désactivé", tone: "neutral" }} />}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Clients</dt>
                      <dd className="font-semibold tabular-nums">{clients}</dd>
                    </div>
                    {canSeeCommissions && (
                      <>
                        <div>
                          <dt className="text-xs text-slate-500">À payer</dt>
                          <dd className={`font-semibold tabular-nums ${toPay.length ? "text-orange-800" : ""}`}>{money(toPay)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Payé</dt>
                          <dd className="font-semibold tabular-nums">{money(paid)}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                  <p className="text-xs text-slate-500">
                    Commission : <span className="tabular-nums">{formatMoney(partner.commissionMinor, partner.currency)}</span> par client
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
