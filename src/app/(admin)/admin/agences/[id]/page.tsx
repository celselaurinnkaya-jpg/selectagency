import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarClock, CreditCard, FolderKanban, HardDrive, Users } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Field, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { BILLING_PERIOD, METHOD_KIND, ROLE, TICKET_STATUS } from "@/lib/domain/labels";
import { dayKey, formatDate, formatMoney } from "@/lib/format";
import { SubscriptionForm, SubscriptionPaymentForm, VoidSubscriptionPaymentForm } from "@/features/admin/AdminForms";
import { agencyStatus, AUDIT_ACTIONS, CONSOLE_TIMEZONE, formatBytes } from "@/features/admin/display";
import { getAgency } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Agence" };

export default function ConsoleAgencyPage({ params }: PageProps<"/admin/agences/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleAgency params={params} />
    </Suspense>
  );
}

const dateInput = (iso?: string) => (iso ? dayKey(iso, CONSOLE_TIMEZONE) : undefined);

async function ConsoleAgency({ params }: Pick<PageProps<"/admin/agences/[id]">, "params">) {
  const { id } = await params;
  const detail = await getAgency(id);
  if (!detail) notFound();
  const { agency, plans, members, payments, tickets, audit } = detail;
  const now = new Date();
  const { spec, attention } = agencyStatus(agency, now);
  const tz = CONSOLE_TIMEZONE;
  const planOptions = plans.map((p) => ({
    value: p.id,
    label: `${p.name} — ${formatMoney(p.priceMinor, p.currency)} ${BILLING_PERIOD[p.billingPeriod].per}${p.isActive ? "" : " (retirée)"}`,
  }));
  const team = members.filter((m) => !m.removedAt);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/agences", label: "Retour aux agences" }}
        eyebrow={<StatusBadge spec={spec} />}
        title={agency.name}
        description={`${[agency.city, countryName(agency.countryCode)].filter(Boolean).join(", ")} · devise ${agency.currency} · inscrite le ${formatDate(agency.createdAt, tz)}`}
      />
      {attention && (
        <div className="mb-5">
          <Notice tone="warning">{attention}</Notice>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Membres actifs" value={agency.members} icon={Users} />
          <StatCard label="Clients" value={agency.clients} icon={Users} />
          <StatCard label="Dossiers" value={agency.cases} hint={`${agency.casesActive} actifs`} icon={FolderKanban} />
          <StatCard label="Stockage" value={formatBytes(agency.storageBytes)} icon={HardDrive} />
        </div>

        {agency.isDemo ? (
          <Notice>Agence de démonstration : pas d&apos;abonnement. Elle est supprimée quand son propriétaire la quitte pour créer sa vraie agence.</Notice>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Abonnement">
              <Card className="space-y-4">
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Field label="Formule">{agency.planName ?? "Aucune"}</Field>
                  <Field label="Fin de l'essai">{agency.trialEndsAt ? formatDate(agency.trialEndsAt, tz) : "—"}</Field>
                  <Field label="Échéance">{agency.currentPeriodEnd ? formatDate(agency.currentPeriodEnd, tz) : "—"}</Field>
                </dl>
                {agency.status && (
                  <SubscriptionForm
                    organizationId={agency.id}
                    plans={planOptions}
                    current={{ planId: agency.planId, status: agency.status, trialEndsAt: dateInput(agency.trialEndsAt), currentPeriodEnd: dateInput(agency.currentPeriodEnd) }}
                  />
                )}
              </Card>
            </Section>
            <Section title="Enregistrer un paiement d'abonnement">
              <Card>
                <SubscriptionPaymentForm organizationId={agency.id} plans={planOptions} defaultCurrency={agency.currency} defaultPlanId={agency.planId} today={dayKey(now, tz)} />
              </Card>
            </Section>
          </div>
        )}

        <Section title="Paiements de l'abonnement">
          {payments.length === 0 ? (
            <EmptyState icon={CreditCard} title="Aucun paiement enregistré" />
          ) : (
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id}>
                  <Card className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</span>
                      {p.status === "voided" ? <StatusBadge spec={{ label: "Annulé", tone: "neutral" }} /> : <StatusBadge spec={{ label: "Reçu", tone: "success" }} />}
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDate(p.paidAt, tz)} · {METHOD_KIND[p.methodKind]}
                      {p.transactionReference && ` · réf. ${p.transactionReference}`}
                      {p.planName && ` · ${p.planName}`}
                      {p.periodEnd && ` · jusqu'au ${formatDate(p.periodEnd, tz)}`}
                      {p.recordedByEmail && ` · saisi par ${p.recordedByEmail}`}
                    </p>
                    {p.status === "voided" ? <p className="text-xs text-slate-600">Motif : {p.voidReason}</p> : <VoidSubscriptionPaymentForm paymentId={p.id} />}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="Équipe">
            <ul className="space-y-2">
              {team.map((m) => (
                <li key={m.memberId}>
                  <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{m.fullName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {m.email}
                        {m.lastSignInAt ? ` · dernière connexion le ${formatDate(m.lastSignInAt, tz)}` : " · jamais connecté"}
                      </span>
                    </span>
                    <StatusBadge spec={ROLE[m.role]} />
                  </Card>
                </li>
              ))}
            </ul>
            {members.length > team.length && <p className="mt-2 text-xs text-slate-500">{members.length - team.length} ancien(s) membre(s) sans accès.</p>}
          </Section>

          <Section title="Demandes de support">
            {tickets.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune demande.</p>
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/support/${t.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                      <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{t.subject}</span>
                          <span className="block text-xs text-slate-500">
                            {t.reference} · {formatDate(t.updatedAt, tz, "dateTime")}
                          </span>
                        </span>
                        <StatusBadge spec={TICKET_STATUS[t.status]} />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Journal de cette agence">
          {audit.length === 0 ? (
            <p className="text-sm text-slate-600">Aucune action de la console sur cette agence.</p>
          ) : (
            <ol className="space-y-2">
              {audit.slice(0, 20).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 text-sm">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden />
                  <span>
                    <span className="font-medium text-slate-900">{AUDIT_ACTIONS[entry.action] ?? entry.action}</span>
                    <span className="text-slate-500">
                      {" "}
                      · {formatDate(entry.at, tz, "dateTime")} · {entry.actorEmail}
                      {typeof entry.details.reason === "string" && ` · « ${entry.details.reason} »`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </>
  );
}
