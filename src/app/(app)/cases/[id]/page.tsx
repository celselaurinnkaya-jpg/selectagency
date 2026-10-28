import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, CalendarPlus, Check, CircleDashed, Clock, FileText, Wallet } from "lucide-react";
import { cn } from "cn";
import { TabNav } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Field, Notice, PageHeader, PlannedAction, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import {
  APPLICANT_TAGS,
  APPOINTMENT_KIND,
  APPOINTMENT_STATUS,
  CASE_OUTCOME,
  CASE_STATUS,
  CATEGORY_LABELS,
  CONFIRMATION,
  PRIORITY,
  REQUIREMENT_STATUS,
  ROLE,
  STEP_KIND,
} from "@/lib/domain/labels";
import type { CaseStep } from "@/lib/domain/types";
import { dayKey, formatDate, formatMoney, formatRelativeDay } from "@/lib/format";
import { getCaseDetail } from "@/features/cases/queries";
import { StepTransitionForm } from "@/features/cases/StepTransitionForm";
import { PrepareWhatsApp } from "@/features/communications/PrepareWhatsApp";
import { buildMessageTemplates } from "@/features/communications/templates";
import { CHECKLIST_DISCLAIMER, DOCUMENT_TYPES } from "@/features/documents/checklists";
import { AddRequirementForm, ReviewDocumentForm } from "@/features/documents/DocumentForms";
import { DocumentUpload } from "@/features/documents/DocumentUpload";
import { AddChargeForm, RecordPaymentForm } from "@/features/finance/FinanceForms";
import { TaskCreateForm, TaskToggle } from "@/features/tasks/TaskForms";
import { WORKFLOW_DISCLAIMER } from "@/features/workflows/templates";

export const metadata: Metadata = { title: "Dossier" };

const TABS = [
  { key: "apercu", label: "Aperçu" },
  { key: "etapes", label: "Étapes" },
  { key: "documents", label: "Documents" },
  { key: "rendez-vous", label: "Rendez-vous" },
  { key: "finance", label: "Finance" },
  { key: "taches", label: "Tâches" },
  { key: "communications", label: "Communications" },
  { key: "historique", label: "Historique" },
] as const;

export default function CasePage({ params, searchParams }: PageProps<"/cases/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CaseDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function StepMarker({ step }: { step: CaseStep }) {
  if (step.status === "done") {
    return (
      <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check className="size-4" aria-hidden />
      </span>
    );
  }
  if (step.status === "in_progress") {
    return <span className="flex size-8 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-citron-400">{step.position}</span>;
  }
  if (step.status === "skipped") {
    return (
      <span className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400">
        <CircleDashed className="size-4" aria-hidden />
      </span>
    );
  }
  return <span className="flex size-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-sm text-slate-500">{step.position}</span>;
}

const STEP_STATUS_TEXT: Record<CaseStep["status"], string> = {
  done: "Terminée",
  in_progress: "En cours",
  pending: "À venir",
  skipped: "Passée",
};

async function CaseDetail({ params, searchParams }: PageProps<"/cases/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getCaseDetail(id);
  if (!detail) notFound();
  const { summary, agency, now, members, permissions, organizationId, steps, transitions, requirements, appointments, tasks, charges, payments, events, communications } = detail;
  const { travelCase: c, client, finance, current } = summary;
  const tz = agency.timezone;
  const tab = TABS.find((t) => t.key === query.tab)?.key ?? "apercu";
  const base = `/cases/${c.id}`;
  const memberName = (memberId?: string) => members.find((m) => m.id === memberId)?.fullName ?? "—";
  const missing = requirements.filter((r) => r.isRequired && (r.status === "not_received" || r.status === "to_correct" || r.status === "expired"));
  const toReview = requirements.filter((r) => r.status === "received" || r.status === "to_verify");
  const nextAppointment = appointments.find((a) => new Date(a.startsAt).getTime() > now.getTime());
  const isActive = c.status === "active";
  // Les actions ne sont proposées qu'aux rôles qui peuvent les faire (la base refuserait de toute façon).
  const canEdit = isActive && permissions.write;
  const balanceLabel = finance.balanceMinor ? formatMoney(finance.balanceMinor, finance.currency) : undefined;

  return (
    <>
      <PageHeader
        back={{ href: "/cases", label: "Retour aux dossiers" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{c.reference}</span>
            <StatusBadge spec={CASE_STATUS[c.status]} />
            {c.outcome !== "pending" && <StatusBadge spec={CASE_OUTCOME[c.outcome]} />}
            <StatusBadge spec={PRIORITY[c.priority]} />
          </span>
        }
        title={c.title}
        description={
          <>
            <Link href={`/clients/${client.id}`} className="font-medium text-navy-700 hover:underline">
              {client.firstName} {client.lastName}
            </Link>{" "}
            · {CATEGORY_LABELS[c.category]} · {countryName(c.destinationCountry)} · conseiller : {memberName(c.assignedTo)}
          </>
        }
      />

      {query.ok === "dossier-cree" && (
        <div className="mb-4">
          <Notice tone="success" title="Dossier créé">
            Les étapes et la liste des pièces ont été copiées depuis les modèles. Relisez la liste des pièces dans l&apos;onglet Documents.
          </Notice>
        </div>
      )}

      {isActive && c.nextAction && (
        <div className={cn("mb-5 flex flex-col gap-1 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between", summary.isOverdue ? "border-red-200 bg-red-50" : "border-citron-500 bg-citron-50")}>
          <p className="flex items-start gap-2 text-sm text-slate-900">
            {summary.isOverdue ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden /> : <Clock className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden />}
            <span>
              <strong>Prochaine action :</strong> {c.nextAction}
            </span>
          </p>
          {c.nextActionDueAt && (
            <span className={cn("text-sm", summary.isOverdue ? "font-semibold text-red-800" : "text-slate-700")}>
              {summary.isOverdue ? "En retard · " : "Échéance : "}
              {formatRelativeDay(c.nextActionDueAt, now, tz, false)}
            </span>
          )}
        </div>
      )}

      <TabNav
        label="Sections du dossier"
        active={tab}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: t.key === "apercu" ? base : `${base}?tab=${t.key}`,
          count: t.key === "documents" ? missing.length + toReview.length || undefined : t.key === "taches" ? tasks.filter((x) => x.status === "todo" || x.status === "in_progress").length || undefined : undefined,
        }))}
      />

      {tab === "apercu" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Étape en cours" value={<span className="text-base">{current?.label ?? "Dossier clôturé"}</span>} hint={current ? STEP_KIND[current.kind].waitingLabel : undefined} icon={Clock} href={`${base}?tab=etapes`} />
            <StatCard label="Pièces manquantes" value={missing.length} hint={`${toReview.length} à examiner`} icon={AlertTriangle} href={`${base}?tab=documents`} tone={missing.length ? "danger" : "navy"} />
            {permissions.financeRead && (
              <>
                <StatCard label="Encaissé" value={formatMoney(finance.paidMinor, finance.currency)} hint={`sur ${formatMoney(finance.agreedMinor, finance.currency)} convenus`} icon={Wallet} href={`${base}?tab=finance`} />
                <StatCard label="Solde dû" value={formatMoney(finance.balanceMinor, finance.currency)} icon={Wallet} href={`${base}?tab=finance`} tone={finance.balanceMinor ? "warning" : "success"} />
              </>
            )}
          </div>
          <Section title="Informations du dossier">
            <Card>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Pays de résidence">{countryName(c.residenceCountry)}</Field>
                <Field label="Destination">{countryName(c.destinationCountry)}</Field>
                <Field label="Ouverture">{formatDate(c.openedAt, tz)}</Field>
                <Field label="Départ envisagé">{c.plannedDepartureDate ? formatDate(`${c.plannedDepartureDate}T12:00:00Z`, tz) : "—"}</Field>
                <Field label="Profil du demandeur">{c.applicantTags.length ? c.applicantTags.map((t) => APPLICANT_TAGS[t]).join(", ") : "—"}</Field>
                <Field label="Devise de facturation">{c.billingCurrency}</Field>
                {c.details.institution && <Field label="Établissement visé">{c.details.institution}</Field>}
                {c.details.program && <Field label="Formation">{c.details.program}</Field>}
                {c.details.intake && <Field label="Rentrée visée">{c.details.intake}</Field>}
                {c.closedAt && <Field label="Clôture">{formatDate(c.closedAt, tz)}</Field>}
              </dl>
            </Card>
            {client.notes && (
              <Card className="mt-3">
                <h3 className="text-sm font-semibold text-slate-800">Notes sur le client</h3>
                <p className="mt-1 text-sm text-slate-700">{client.notes}</p>
              </Card>
            )}
          </Section>
        </div>
      )}

      {tab === "etapes" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
          <Section title="Parcours du dossier">
            <ol className="space-y-2">
              {steps.map((step) => (
                <li key={step.id} className="flex gap-3">
                  <StepMarker step={step} />
                  <div className={cn("min-w-0 flex-1 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(2,55,100,0.08)]", step.status === "in_progress" && "ring-2 ring-navy-700", step.status === "skipped" && "opacity-70")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{step.label}</span>
                      {step.isOptional && <span className="text-xs text-slate-500">(facultative)</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge spec={{ label: STEP_KIND[step.kind].label, tone: step.kind === "outcome" && step.outcome ? CASE_OUTCOME[step.outcome].tone : STEP_KIND[step.kind].tone }} />
                      <span className="text-xs text-slate-600">{STEP_STATUS_TEXT[step.status]}</span>
                      {step.confirmationLevel && <StatusBadge spec={CONFIRMATION[step.confirmationLevel]} />}
                    </div>
                    {(step.evidenceRef || step.sourceNote || step.note) && (
                      <p className="mt-1 text-sm text-slate-600">{step.evidenceRef ? `Justificatif : ${step.evidenceRef}` : step.sourceNote ? `Source : ${step.sourceNote}` : step.note}</p>
                    )}
                    {step.completedAt && step.status !== "pending" && (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(step.completedAt, tz, "dateTime")} · {memberName(step.completedBy)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-slate-500">{WORKFLOW_DISCLAIMER}</p>
          </Section>
          <Section title="Faire avancer le dossier" className="order-first xl:order-none">
            <Card>
              {canEdit && current && transitions ? (
                <StepTransitionForm
                  caseId={c.id}
                  version={c.version ?? 1}
                  currentLabel={current.label}
                  forward={transitions.forward}
                  back={transitions.back}
                  canSkip={transitions.canSkip}
                  needsConfirmation={transitions.needsConfirmation}
                  balanceDue={balanceLabel}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  {isActive ? "Votre rôle permet de consulter ce dossier, pas de le faire avancer." : "Ce dossier est clôturé : ses étapes ne peuvent plus être modifiées."}
                </p>
              )}
            </Card>
          </Section>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-6">
          <Section title="Pièces du dossier">
            <ul className="space-y-2">
              {requirements.map((r) => {
                const awaitingReview = r.status === "received" || r.status === "to_verify";
                const needsFile = r.status === "not_received" || r.status === "to_correct" || r.status === "expired";
                return (
                  <li key={r.id}>
                    <Card className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{r.label}</p>
                          <p className="text-xs text-slate-500">
                            {r.category} · {r.isRequired ? "Obligatoire" : "Facultatif"}
                            {r.fileName && ` · ${r.fileName}`}
                            {r.receivedAt && ` · reçu le ${formatDate(r.receivedAt, tz)}`}
                            {r.expiresAt && ` · expire le ${formatDate(`${r.expiresAt}T12:00:00Z`, tz)}`}
                          </p>
                          {r.reviewComment && <p className="mt-1 text-sm text-red-800">À corriger : {r.reviewComment}</p>}
                        </div>
                        <StatusBadge spec={REQUIREMENT_STATUS[r.status]} />
                      </div>
                      {r.storagePath && permissions.documentsRead && (
                        <a
                          href={`/documents/${r.id}/fichier`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline"
                        >
                          <FileText className="size-4" aria-hidden />
                          Ouvrir le fichier
                        </a>
                      )}
                      {canEdit && awaitingReview && <ReviewDocumentForm requirementId={r.id} label={r.label} />}
                      {canEdit && needsFile && <DocumentUpload organizationId={organizationId} caseId={c.id} requirementId={r.id} label={r.label} />}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </Section>
          {canEdit && (
            <Section title="Compléter la liste">
              <Card>
                <AddRequirementForm
                  caseId={c.id}
                  options={DOCUMENT_TYPES.filter((t) => !requirements.some((r) => r.documentTypeCode === t.code)).map((t) => ({ value: t.code, label: `${t.label} (${t.category})` }))}
                />
              </Card>
            </Section>
          )}
          <Notice>
            « Vérifié par l&apos;agence » signifie que l&apos;équipe a contrôlé la pièce. Ce n&apos;est jamais une validation par une ambassade,
            un consulat ou une administration. {CHECKLIST_DISCLAIMER}
          </Notice>
        </div>
      )}

      {tab === "rendez-vous" && (
        <Section title="Rendez-vous et échéances" action={isActive ? <PlannedAction icon={CalendarPlus} label="Programmer un rendez-vous" reason="Formulaire prévu à la prochaine étape (Phase 4)." /> : undefined}>
          {appointments.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun rendez-vous pour ce dossier.</p>
          ) : (
            <ul className="space-y-2">
              {appointments.map((a) => (
                <li key={a.id}>
                  <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block text-sm font-semibold text-navy-800">{formatRelativeDay(a.startsAt, now, tz, !a.allDay)}</span>
                      <span className="block text-sm text-slate-900">{a.title}</span>
                      <span className="block text-xs text-slate-500">{[APPOINTMENT_KIND[a.kind], a.location, memberName(a.assignedTo)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <StatusBadge spec={APPOINTMENT_STATUS[a.status]} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "finance" && !permissions.financeRead && (
        <Notice title="Finance non accessible">Votre rôle permet de consulter le dossier, mais pas ses montants ni ses paiements.</Notice>
      )}

      {tab === "finance" && permissions.financeRead && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Frais de l'agence" value={formatMoney(finance.agreedAgencyMinor, finance.currency)} hint="Revenus propres convenus" icon={Wallet} />
            <StatCard label="Montants pour des tiers" value={formatMoney(finance.agreedThirdPartyMinor, finance.currency)} hint="À reverser (frais officiels…)" icon={Wallet} />
            <StatCard label="Encaissé" value={formatMoney(finance.paidMinor, finance.currency)} icon={Wallet} tone="success" />
            <StatCard label={finance.overpaidMinor ? "Trop-perçu" : "Solde dû"} value={formatMoney(finance.overpaidMinor || finance.balanceMinor, finance.currency)} icon={Wallet} tone={finance.balanceMinor ? "warning" : "success"} />
          </div>
          <Section title="Prestations convenues">
            {charges.length === 0 && <p className="mb-3 text-sm text-slate-600">Aucune prestation : ajoutez ce qui a été convenu avec le client avant d&apos;enregistrer un paiement.</p>}
            <ul className="space-y-2">
              {charges.map(({ charge, allocatedMinor, remainingMinor }) => (
                <li key={charge.id}>
                  <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{charge.label}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge spec={charge.chargeType === "agency_fee" ? { label: "Frais de l'agence", tone: "navy" } : { label: "Montant pour un tiers", tone: "external" }} />
                        {charge.originalAmount && (
                          <span className="text-xs text-slate-500">
                            ≈ {formatMoney(charge.originalAmount.amountMinor, charge.originalAmount.currency)} ({charge.originalAmount.rateNote})
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-left text-sm tabular-nums sm:text-right">
                      <span className="block font-semibold text-slate-900">{formatMoney(charge.amountMinor, charge.currency)}</span>
                      <span className="block text-xs text-slate-500">
                        payé {formatMoney(allocatedMinor, charge.currency)} · reste {formatMoney(remainingMinor, charge.currency)}
                      </span>
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
            {permissions.financeWrite && c.status !== "cancelled" && (
              <Card className="mt-3">
                <AddChargeForm caseId={c.id} currency={c.billingCurrency} />
              </Card>
            )}
          </Section>
          {permissions.financeWrite && c.status !== "cancelled" && charges.some((x) => x.remainingMinor > 0) && (
            <Section title="Enregistrer un paiement">
              <Card>
                <RecordPaymentForm
                  caseId={c.id}
                  currency={c.billingCurrency}
                  remainingLabel={formatMoney(charges.reduce((sum, x) => sum + x.remainingMinor, 0), c.billingCurrency)}
                  defaultDate={dayKey(now, tz)}
                  defaultPayer={`${client.firstName} ${client.lastName}`}
                />
              </Card>
            </Section>
          )}
          <Section title="Paiements et reçus">
            {payments.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun paiement enregistré.</p>
            ) : (
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id}>
                    <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        <span className="block font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</span>
                        <span className="block text-xs text-slate-500">
                          {formatDate(p.paidAt, tz, "dateTime")} · {p.methodLabel}
                          {p.transactionReference && ` · réf. ${p.transactionReference}`} · reçu par {memberName(p.receivedBy)}
                        </span>
                      </span>
                      <Link href={`/finance/receipts/${p.id}`} className="text-sm font-medium text-navy-700 hover:underline">
                        Reçu {p.receiptNumber}
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === "taches" && (
        <div className="space-y-6">
          <Section title="Tâches du dossier">
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune tâche pour ce dossier.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => {
                  const done = t.status === "done";
                  const overdue = !done && new Date(t.dueAt).getTime() < now.getTime();
                  return (
                    <li key={t.id}>
                      <Card className="flex items-start gap-3">
                        <TaskToggle taskId={t.id} done={done} title={t.title} />
                        <span className="min-w-0">
                          <span className={cn("block text-sm font-medium", done ? "text-slate-500 line-through" : "text-slate-900")}>{t.title}</span>
                          <span className={cn("block text-xs", overdue ? "font-semibold text-red-700" : "text-slate-500")}>
                            {overdue && "En retard · "}
                            {formatRelativeDay(t.dueAt, now, tz)} · {memberName(t.assignedTo)}
                          </span>
                        </span>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          {canEdit && (
            <Section title="Ajouter une tâche">
              <Card>
                <TaskCreateForm
                  fixedCaseId={c.id}
                  defaultMemberId={c.assignedTo}
                  defaultDate={dayKey(now, tz)}
                  members={members.filter((m) => m.role !== "viewer").map((m) => ({ value: m.id, label: `${m.fullName} (${ROLE[m.role].label})` }))}
                />
              </Card>
            </Section>
          )}
        </div>
      )}

      {tab === "communications" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Préparer un message WhatsApp">
            <Card>
              {!permissions.write ? (
                <p className="text-sm text-slate-600">Votre rôle permet de consulter les communications, pas d&apos;en préparer.</p>
              ) : (
              <PrepareWhatsApp
                clientId={client.id}
                caseId={c.id}
                phoneDigits={client.isDemoFixture ? undefined : (client.whatsappE164 ?? client.phoneE164).replace(/\D/g, "")}
                templates={buildMessageTemplates({
                  firstName: client.firstName,
                  agencyName: agency.name,
                  caseReference: c.reference,
                  missingDocuments: missing.map((r) => r.label),
                  nextAppointment: nextAppointment ? { title: nextAppointment.title, when: formatRelativeDay(nextAppointment.startsAt, now, tz, !nextAppointment.allDay).toLowerCase(), location: nextAppointment.location } : undefined,
                  balance: permissions.financeRead ? balanceLabel : undefined,
                })}
              />
              )}
            </Card>
          </Section>
          <Section title="Historique des communications">
            {communications.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune communication enregistrée pour ce dossier.</p>
            ) : (
              <ul className="space-y-2">
                {communications.map((m) => (
                  <li key={m.id}>
                    <Card>
                      <span className="block text-sm font-medium text-slate-900">WhatsApp · {m.summary}</span>
                      <span className="block text-xs text-slate-500">
                        Préparé, envoi manuel · {formatRelativeDay(m.at, now, tz)} · {memberName(m.actorId)}
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === "historique" && (
        <Section title="Historique du dossier">
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-navy-700" aria-hidden />
                <span>
                  <span className="text-slate-900">{e.text}</span>
                  <span className="block text-xs text-slate-500">
                    {formatDate(e.at, tz, "dateTime")} · {memberName(e.actorId)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}
