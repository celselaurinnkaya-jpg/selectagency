import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Building2, Clock, FolderKanban, HardDrive, LifeBuoy, ShieldCheck, Users } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { TICKET_STATUS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { agencyStatus, CONSOLE_TIMEZONE, formatBytes, monthLabel } from "@/features/admin/display";
import { getOverview, listAgencies, listTickets } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default function ConsoleHome() {
  return (
    <>
      <PageHeader title="Vue d'ensemble" description="Les agences inscrites, leurs abonnements et l'activité de la plateforme. Aucune donnée des clients des agences n'est visible ici." />
      <Suspense fallback={<PageSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const [overview, agencies, tickets] = await Promise.all([getOverview(), listAgencies(), listTickets({ status: "open" })]);
  const now = new Date();
  const attention = agencies
    .map((agency) => ({ agency, ...agencyStatus(agency, now) }))
    .filter((a) => a.attention);
  const months = [...new Set([...overview.signups.map((s) => s.month), ...overview.revenue.map((r) => r.month)])].sort().reverse();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Agences inscrites" value={overview.agencies} hint={`${overview.demoAgencies} de démonstration en plus`} icon={Building2} href="/admin/agences" />
        <StatCard label="Abonnements actifs" value={overview.active} hint={`${overview.trialing} en essai gratuit`} icon={ShieldCheck} tone="success" href="/admin/agences?statut=active" />
        <StatCard
          label="À surveiller"
          value={attention.length}
          hint={`${overview.trialExpired} essai(s) terminé(s) · ${overview.suspended} suspendue(s)`}
          icon={AlertTriangle}
          tone={attention.length ? "warning" : "navy"}
          href="#a-surveiller"
        />
        <StatCard label="Demandes en attente" value={overview.openTickets} icon={LifeBuoy} tone={overview.openTickets ? "warning" : "navy"} href="/admin/support" />
        <StatCard label="Comptes utilisateurs" value={overview.users} hint={`${overview.members} membres actifs dans les agences`} icon={Users} href="/admin/utilisateurs" />
        <StatCard label="Dossiers actifs" value={overview.casesActive} hint={`${overview.casesLast30Days} ouverts ces 30 derniers jours`} icon={FolderKanban} />
        <StatCard label="Clients enregistrés" value={overview.clients} hint="Nombre total, toutes agences réelles" icon={Users} />
        <StatCard label="Stockage des pièces" value={formatBytes(overview.storageBytes)} hint={`${overview.files} fichier(s)`} icon={HardDrive} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="À surveiller" id="a-surveiller">
          {attention.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Rien à signaler" description="Aucun essai ne se termine cette semaine, aucun retard ni suspension." />
          ) : (
            <ul className="space-y-2">
              {attention.map(({ agency, spec, attention: reason }) => (
                <li key={agency.id}>
                  <Link href={`/admin/agences/${agency.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                    <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{agency.name}</span>
                        <span className="block text-xs text-slate-500">{reason}</span>
                      </span>
                      <StatusBadge spec={spec} />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Demandes de support en attente">
          {tickets.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="Aucune demande en attente" />
          ) : (
            <ul className="space-y-2">
              {tickets.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/support/${t.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                    <Card className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-500">{t.reference}</span>
                        <StatusBadge spec={TICKET_STATUS[t.status]} />
                      </div>
                      <p className="font-medium text-slate-900">{t.subject}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="size-3.5" aria-hidden />
                        {t.organizationName} · {formatDate(t.updatedAt, CONSOLE_TIMEZONE, "dateTime")}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Six derniers mois">
        {months.length === 0 ? (
          <p className="text-sm text-slate-600">Aucune inscription ni aucun paiement d&apos;abonnement sur la période.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
            <table className="w-full min-w-md text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2">Mois</th>
                  <th scope="col" className="px-4 py-2 text-right">Nouvelles agences</th>
                  <th scope="col" className="px-4 py-2 text-right">Paiements d&apos;abonnement reçus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((month) => {
                  const revenue = overview.revenue.filter((r) => r.month === month);
                  return (
                    <tr key={month}>
                      <th scope="row" className="px-4 py-2 text-left font-medium text-slate-900 first-letter:uppercase">{monthLabel(month)}</th>
                      <td className="px-4 py-2 text-right tabular-nums">{overview.signups.find((s) => s.month === month)?.count ?? 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {revenue.length ? revenue.map((r) => formatMoney(r.amountMinor, r.currency)).join(" · ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Notice>
        Les chiffres d&apos;activité (clients, dossiers, fichiers) sont des totaux calculés par la base : la console ne lit jamais le contenu des
        fiches, des dossiers ni des pièces des agences.
      </Notice>
    </div>
  );
}
