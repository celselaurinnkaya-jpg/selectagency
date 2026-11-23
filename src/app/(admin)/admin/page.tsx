import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Building2, Clock, FolderKanban, HardDrive, LifeBuoy, Mail, MessageCircle, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { BILLING_PERIOD, TICKET_STATUS, type LabelSpec } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { agencyEffectiveStatus, agencyStatus, CONSOLE_TIMEZONE, formatBytes, monthLabel } from "@/features/admin/display";
import { getOverview, listAgencies, listTickets, type AgencyRow } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Vue d'ensemble" };

const DAY = 86_400_000;
/** Demande de support sans réponse au-delà de ce délai : signalée (rapport de test de la console, 23/11). */
const SUPPORT_LATE_HOURS = 24;
/** Essai sans aucune activité depuis ce nombre de jours : signalé, pour relancer l'agence avant la fin de l'essai. */
const TRIAL_IDLE_DAYS = 3;
/** Échéances à encaisser : celles des 7 prochains jours, et toutes celles déjà dépassées. */
const DUE_SOON_DAYS = 7;

export default function ConsoleHome() {
  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description="Le revenu, les abonnements et l'activité des agences clientes. Les agences internes (équipe SELECT) et de démonstration sont comptées à part. Aucune donnée des clients des agences n'est visible ici."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

/** Six derniers mois, du plus récent au plus ancien (« 2026-11 », « 2026-10 »…). */
function lastSixMonths(now: Date): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Message de relance prérempli : rien ne part tout seul, la personne relit et envoie depuis WhatsApp ou sa messagerie. */
function reminderText(agency: AgencyRow, dueLabel: string): string {
  const amount =
    agency.planPriceMinor !== undefined && agency.planCurrency ? ` (${formatMoney(agency.planPriceMinor, agency.planCurrency)})` : "";
  return [
    `Bonjour${agency.ownerName ? ` ${agency.ownerName}` : ""},`,
    `l'abonnement SELECT Agency de ${agency.name}${agency.planName ? `, formule ${agency.planName}${amount},` : ""} ${dueLabel}.`,
    "Vous pouvez le régler depuis Paramètres > Abonnement, ou par Mobile Money ou virement en nous envoyant la référence du paiement.",
    "Merci, l'équipe SELECT",
  ].join("\n");
}

async function Overview() {
  const [overview, agencies, tickets] = await Promise.all([getOverview(), listAgencies(), listTickets({ status: "open" })]);
  const now = new Date();
  const clients = agencies.filter((a) => !a.isDemo && !a.isInternal);

  // À surveiller : abonnements, essais sans activité, demandes de support sans réponse.
  const watch: { key: string; href: string; title: string; reason: string; spec: LabelSpec }[] = [];
  for (const agency of agencies) {
    const { spec, attention } = agencyStatus(agency, now);
    const reasons = attention ? [attention] : [];
    const status = agencyEffectiveStatus(agency, now);
    const idleSince = agency.lastActivityAt ?? agency.createdAt;
    const idleDays = Math.floor((now.getTime() - new Date(idleSince).getTime()) / DAY);
    if (!agency.isDemo && !agency.isInternal && status === "trialing" && idleDays >= TRIAL_IDLE_DAYS) {
      reasons.push(agency.lastActivityAt ? `Essai sans activité depuis ${idleDays} jours` : `Essai jamais utilisé depuis l'inscription (${idleDays} jours)`);
    }
    if (reasons.length) watch.push({ key: agency.id, href: `/admin/agences/${agency.id}`, title: agency.name, reason: reasons.join(" · "), spec });
  }
  for (const t of tickets) {
    const hours = Math.floor((now.getTime() - new Date(t.updatedAt).getTime()) / 3_600_000);
    if (hours >= SUPPORT_LATE_HOURS) {
      watch.push({
        key: t.id,
        href: `/admin/support/${t.id}`,
        title: `${t.reference} · ${t.organizationName}`,
        reason: `Demande de support sans réponse depuis ${hours >= 48 ? `${Math.floor(hours / 24)} jours` : `${hours} heures`}`,
        spec: { label: "Support en retard", tone: "warning" },
      });
    }
  }

  // À encaisser : agences clientes actives (ou en retard) dont l'échéance approche, est dépassée ou n'est pas fixée.
  const toCollect = clients
    .filter((a) => a.status === "active" || a.status === "past_due")
    .map((agency) => {
      const end = agency.currentPeriodEnd ? new Date(agency.currentPeriodEnd).getTime() : undefined;
      const days = end === undefined ? undefined : Math.ceil((end - now.getTime()) / DAY);
      return { agency, days };
    })
    .filter(({ days }) => days === undefined || days <= DUE_SOON_DAYS)
    .sort((a, b) => (a.days ?? -9999) - (b.days ?? -9999));

  const conversion = overview.trialsFinished ? Math.round((overview.trialsConverted / overview.trialsFinished) * 100) : undefined;
  const months = lastSixMonths(now);
  const anyRevenue = overview.revenue.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Revenu mensuel récurrent"
          value={overview.mrr.length ? overview.mrr.map((m) => formatMoney(m.amountMinor, m.currency)).join(" · ") : formatMoney(0, "XAF")}
          hint={`${overview.mrr.reduce((s, m) => s + m.subscriptions, 0)} abonnement(s) payant(s), prix ramené au mois`}
          icon={TrendingUp}
          tone="success"
          href="#revenu"
        />
        <StatCard
          label="Agences clientes"
          value={overview.agencies}
          hint={`${overview.internalAgencies} interne(s) et ${overview.demoAgencies} de démonstration à part`}
          icon={Building2}
          href="/admin/agences"
        />
        <StatCard label="Abonnements actifs" value={overview.active} hint={`${overview.trialing} en essai gratuit`} icon={ShieldCheck} tone="success" href="/admin/agences?statut=active" />
        <StatCard
          label="Conversion des essais"
          value={conversion === undefined ? "—" : `${conversion} %`}
          hint={`${overview.trialsConverted} payant(s) sur ${overview.trialsFinished} essai(s) terminé(s) · ${overview.churnedLast30Days} résiliation(s) en 30 jours`}
          icon={TrendingUp}
        />
        <StatCard label="À encaisser" value={toCollect.length} hint="Échéances proches, dépassées ou à fixer" icon={Wallet} tone={toCollect.length ? "warning" : "navy"} href="#a-encaisser" />
        <StatCard
          label="À surveiller"
          value={watch.length}
          hint={`${overview.trialExpired} essai(s) terminé(s) · ${overview.suspended} suspendue(s)`}
          icon={AlertTriangle}
          tone={watch.length ? "warning" : "navy"}
          href="#a-surveiller"
        />
        <StatCard label="Demandes en attente" value={overview.openTickets} icon={LifeBuoy} tone={overview.openTickets ? "warning" : "navy"} href="/admin/support" />
        <StatCard label="Comptes utilisateurs" value={overview.users} hint={`${overview.members} membres actifs dans les agences`} icon={Users} href="/admin/utilisateurs" />
        <StatCard label="Dossiers actifs" value={overview.casesActive} hint={`${overview.casesLast30Days} ouverts ces 30 derniers jours`} icon={FolderKanban} />
        <StatCard label="Clients enregistrés" value={overview.clients} hint="Nombre total, toutes agences réelles" icon={Users} />
        <StatCard label="Stockage des pièces" value={formatBytes(overview.storageBytes)} hint={`${overview.files} fichier(s)`} icon={HardDrive} />
      </div>

      <Section title="À encaisser" id="a-encaisser">
        {toCollect.length === 0 ? (
          <EmptyState icon={Wallet} title="Rien à encaisser cette semaine" description="Aucune échéance dans les 7 prochains jours, aucune échéance dépassée." />
        ) : (
          <ul className="space-y-2">
            {toCollect.map(({ agency, days }) => {
              const dueLabel =
                days === undefined
                  ? "n'a pas encore d'échéance fixée"
                  : days < 0
                    ? `est arrivé à échéance le ${formatDate(agency.currentPeriodEnd!, CONSOLE_TIMEZONE)}`
                    : `arrive à échéance le ${formatDate(agency.currentPeriodEnd!, CONSOLE_TIMEZONE)}`;
              const text = reminderText(agency, dueLabel);
              const phoneDigits = agency.phone?.replace(/\D/g, "");
              return (
                <li key={agency.id}>
                  <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/admin/agences/${agency.id}`} className="min-w-0 hover:underline">
                      <span className="block truncate font-medium text-slate-900">{agency.name}</span>
                      <span className="block text-xs text-slate-500">
                        {agency.planName ? `Formule ${agency.planName}` : "Sans formule"}
                        {agency.planPriceMinor !== undefined && agency.planCurrency && agency.planBillingPeriod
                          ? ` · ${formatMoney(agency.planPriceMinor, agency.planCurrency)} ${BILLING_PERIOD[agency.planBillingPeriod].per}`
                          : ""}
                        {" · "}
                        <span className={days !== undefined && days < 0 ? "font-semibold text-red-700" : "font-semibold text-orange-800"}>
                          {days === undefined
                            ? "échéance à fixer"
                            : days < 0
                              ? `échéance dépassée depuis ${-days} jour(s)`
                              : days === 0
                                ? "échéance aujourd'hui"
                                : `échéance dans ${days} jour(s)`}
                        </span>
                      </span>
                    </Link>
                    <span className="flex shrink-0 flex-wrap gap-2">
                      {phoneDigits && (
                        <a
                          href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-navy-800 hover:border-navy-300"
                        >
                          <MessageCircle className="size-4" aria-hidden />
                          Relancer par WhatsApp
                        </a>
                      )}
                      {agency.ownerEmail && (
                        <a
                          href={`mailto:${agency.ownerEmail}?subject=${encodeURIComponent(`Abonnement SELECT Agency de ${agency.name}`)}&body=${encodeURIComponent(text)}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-navy-800 hover:border-navy-300"
                        >
                          <Mail className="size-4" aria-hidden />
                          Relancer par e-mail
                        </a>
                      )}
                    </span>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Les boutons ouvrent WhatsApp ou votre messagerie avec un message prérempli : rien n&apos;est envoyé sans vous. Le téléphone de l&apos;agence
          vient de ses réglages de facture.
        </p>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="À surveiller" id="a-surveiller">
          {watch.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Rien à signaler" description="Aucun essai qui se termine ou reste inutilisé, aucun retard, aucune demande sans réponse." />
          ) : (
            <ul className="space-y-2">
              {watch.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                    <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{item.title}</span>
                        <span className="block text-xs text-slate-500">{item.reason}</span>
                      </span>
                      <StatusBadge spec={item.spec} />
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

      <Section title="Revenu mensuel récurrent par formule" id="revenu">
        {overview.mrrByPlan.length === 0 ? (
          <p className="text-sm text-slate-600">
            Aucun abonnement payant actif pour le moment. Le revenu mensuel compte les agences clientes actives (ou en retard de paiement) dont la
            formule a un prix, ramené au mois (trimestriel ÷ 3, annuel ÷ 12).
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {overview.mrrByPlan.map((p) => (
              <li key={`${p.plan}-${p.currency}`}>
                <Card className="space-y-1">
                  <p className="font-medium text-slate-900">{p.plan}</p>
                  <p className="text-lg font-semibold tabular-nums text-navy-800">{formatMoney(p.amountMinor, p.currency)} / mois</p>
                  <p className="text-xs text-slate-500">{p.subscriptions} abonnement(s)</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Six derniers mois">
        <div className="overflow-x-auto rounded-xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
          <table className="w-full min-w-md text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2">Mois</th>
                <th scope="col" className="px-4 py-2 text-right">Nouvelles agences clientes</th>
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
        {!anyRevenue && <p className="mt-2 text-xs text-slate-500">Aucun paiement d&apos;abonnement enregistré sur ces six mois (« — »).</p>}
      </Section>

      <Notice>
        Les chiffres d&apos;activité (clients, dossiers, fichiers) sont des totaux calculés par la base : la console ne lit jamais le contenu des
        fiches, des dossiers ni des pièces des agences.
      </Notice>
    </div>
  );
}
