import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, Hourglass, Pencil, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { COMMISSION_STATUS, PROSPECT_BADGE } from "@/lib/domain/labels";
import { dayKey, formatDate, formatMoney, initials } from "@/lib/format";
import { getPartner } from "@/features/partners/queries";
import { CommissionActions, PartnerAccess } from "@/features/partners/PartnerForms";

export const metadata: Metadata = { title: "Partenaire" };

const money = (list: { currency: string; amountMinor: number }[]) => (list.length ? list.map((t) => formatMoney(t.amountMinor, t.currency)).join(" · ") : "0");

export default function PartnerPage({ params, searchParams }: PageProps<"/partners/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PartnerDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PartnerDetail({ params, searchParams }: PageProps<"/partners/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getPartner(id);
  if (!detail) notFound();
  const { partner, clients, toPay, paid, pending, permissions, agency, now } = detail;
  const tz = agency.timezone;
  const today = dayKey(now, tz);
  // Lien d'accès envoyé mais pas encore utilisé : on peut le retransmettre.
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? ""}`;
  const pendingLink = partner.accessToken && permissions.manage ? `${origin}/acces-partenaire/${partner.accessToken}` : undefined;

  return (
    <>
      <PageHeader
        back={{ href: "/partners", label: "Retour aux partenaires" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-sm text-slate-800">{partner.code}</span>
            {!partner.isActive && <StatusBadge spec={{ label: "Désactivé", tone: "neutral" }} />}
          </span>
        }
        title={partner.name}
        description={[partner.phone, partner.email, `Commission : ${formatMoney(partner.commissionMinor, partner.currency)} par client apporté`].filter(Boolean).join(" · ")}
        actions={
          permissions.manage ? (
            <Button asChild variant="outline">
              <Link href={`/partners/${partner.id}/edit`}>
                <Pencil aria-hidden />
                Modifier
              </Link>
            </Button>
          ) : undefined
        }
      />
      {(query.ok === "partenaire-cree" || query.ok === "partenaire-modifie") && (
        <div className="mb-4">
          <Notice tone="success" title={query.ok === "partenaire-cree" ? "Partenaire créé" : "Partenaire mis à jour"}>
            Notez son code ({partner.code}) sur la fiche des clients qu&apos;il vous envoie, à la création ou dans « Modifier ».
          </Notice>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Clients apportés" value={clients.length} icon={Users} />
          {permissions.seeCommissions && (
            <>
              <StatCard label="En attente" value={<span className="text-base">{money(pending)}</span>} hint="Clients qui n'ont pas encore payé" icon={Hourglass} />
              <StatCard label="À payer" value={<span className="text-base">{money(toPay)}</span>} hint="Dès le 1er paiement du client" icon={Wallet} tone={toPay.length ? "warning" : "navy"} />
              <StatCard label="Payé" value={<span className="text-base">{money(paid)}</span>} hint="Commissions versées" icon={CheckCircle2} tone="success" />
            </>
          )}
        </div>

        <Section title="Clients apportés">
          {clients.length === 0 ? (
            <EmptyState icon={Users} title="Aucun client pour le moment" description={`Saisissez le code ${partner.code} sur la fiche d'un client ou d'un prospect qu'il vous envoie.`} />
          ) : (
            <ul className="space-y-3">
              {clients.map(({ client, activeCases, commission }) => (
                <li key={client.id}>
                  <Card className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-citron-400">
                          {initials(`${client.firstName} ${client.lastName}`)}
                        </span>
                        <span className="min-w-0">
                          <Link href={`/clients/${client.id}`} className="font-semibold break-words text-navy-800 hover:underline">
                            {client.firstName} {client.lastName}
                          </Link>
                          <span className="block text-sm text-slate-600">
                            Arrivé le {formatDate(client.registeredAt, tz)} · {activeCases} dossier{activeCases > 1 ? "s" : ""} en cours
                          </span>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {client.status === "prospect" && <StatusBadge spec={PROSPECT_BADGE} />}
                        {commission && <StatusBadge spec={COMMISSION_STATUS[commission.status]} />}
                      </span>
                    </div>
                    {commission && (
                      <p className="text-sm text-slate-700">
                        Commission : <strong className="tabular-nums">{formatMoney(commission.amountMinor, commission.currency)}</strong>
                        {commission.approvedAt && commission.status === "approved" && ` · due depuis le ${formatDate(commission.approvedAt, tz)}`}
                        {commission.paidAt && ` · versée le ${formatDate(commission.paidAt, tz)} (${commission.paidMethod}${commission.paidReference ? `, réf. ${commission.paidReference}` : ""})`}
                        {commission.cancelReason && ` · annulée : ${commission.cancelReason}`}
                      </p>
                    )}
                    {commission && permissions.commissions && <CommissionActions commission={commission} today={today} />}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {permissions.manage && (
          <Section title="Espace partenaire">
            <Card className="space-y-3">
              <p className="text-sm text-slate-600">
                Le partenaire peut suivre ses clients et ses commissions avec son propre accès, en lecture seule. Il voit seulement le prénom et
                l&apos;initiale de chaque client, un avancement simple (« Dossier en cours »…) et ses commissions : jamais les téléphones, documents
                ni paiements des clients.
              </p>
              <PartnerAccess
                partnerId={partner.id}
                partnerName={partner.name}
                defaultEmail={partner.email}
                hasAccess={partner.hasAccess}
                pendingLink={pendingLink}
                pendingEmail={partner.accessEmail}
              />
            </Card>
          </Section>
        )}
      </div>
    </>
  );
}
