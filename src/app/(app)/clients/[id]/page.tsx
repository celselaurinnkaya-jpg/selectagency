import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BriefcaseBusiness, FolderKanban, FolderPlus, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Field, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { DeleteClientModal } from "@/features/clients/DeleteClientModal";
import {
  APPOINTMENT_KIND,
  APPOINTMENT_STATUS,
  CASE_STATUS,
  CATEGORY_LABELS,
  CLIENT_SOURCE,
  CLIENT_TYPE,
  COMMUNICATION_CHANNEL,
  COMMUNICATION_STATUS,
  GENDER_OPTIONS,
  ID_DOC_TYPES,
  LANGUAGES,
  MARITAL_STATUS,
  PAYMENT_STATUS,
  PROSPECT_BADGE,
  REQUIREMENT_STATUS,
  ROLE,
  SERVICE_CLIENT_STATUS,
  SERVICE_MOTIVES,
  STEP_KIND,
} from "@/lib/domain/labels";
import { activeMembers } from "@/lib/domain/members";
import { formatDate, formatMoney, formatRelativeDay } from "@/lib/format";
import { AppointmentForm } from "@/features/appointments/AppointmentForms";
import { getClientDetail } from "@/features/clients/queries";
import { PrepareWhatsApp } from "@/features/communications/PrepareWhatsApp";
import { buildMessageTemplates } from "@/features/communications/templates";
import { ConvertProspectButton, FollowUpForm } from "@/features/prospects/ProspectForms";
import { EnrollForm, ServiceClientActions } from "@/features/services/ServiceForms";
import { caseKindLabel } from "@/features/workflows/templates";
import { ServiceProgress } from "@/features/services/ServiceSteps";
import { BookingPanel } from "@/features/services/BookingForms";

export const metadata: Metadata = { title: "Fiche client" };

const TABS = [
  { key: "apercu", label: "Aperçu" },
  { key: "dossiers", label: "Dossiers" },
  { key: "services", label: "Services" },
  { key: "documents", label: "Documents" },
  { key: "rendez-vous", label: "Rendez-vous" },
  { key: "paiements", label: "Paiements" },
  { key: "communications", label: "Communications" },
  { key: "historique", label: "Historique" },
] as const;

export default function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ClientDetail({ params, searchParams }: PageProps<"/clients/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getClientDetail(id);
  if (!detail) notFound();
  const { client, agency, now, advisor, permissions, cases, requirements, appointments, payments, events, communications, caseReferences, members, services, followUps, today, partner } = detail;
  const tz = agency.timezone;
  const tab = TABS.find((t) => t.key === query.tab)?.key ?? "apercu";
  const base = `/clients/${client.id}`;
  const missing = requirements.filter((r) => r.isRequired && (r.status === "not_received" || r.status === "to_correct"));
  const nextAppointment = appointments.find((a) => new Date(a.startsAt).getTime() > now.getTime());
  const balance = cases.reduce((sum, s) => sum + s.finance.balanceMinor, 0);
  const isProspect = client.status === "prospect";
  const origin = client.source ? `${CLIENT_SOURCE[client.source]}${client.sourceDetail ? ` — ${client.sourceDetail}` : ""}` : (client.sourceDetail ?? "Non précisée");

  return (
    <>
      <PageHeader
        back={isProspect ? { href: "/prospects", label: "Retour aux prospects" } : { href: "/clients", label: "Retour aux clients" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{client.reference}</span>
            {isProspect && <StatusBadge spec={PROSPECT_BADGE} />}
          </span>
        }
        title={`${client.firstName} ${client.lastName}`}
        description={`${isProspect ? "Prospect" : CLIENT_TYPE[client.clientType]} · ${[client.city, countryName(client.residenceCountry)].filter(Boolean).join(", ")} · suivi par ${advisor?.fullName ?? "—"}`}
        actions={
          permissions.write || permissions.delete ? (
          <>
            {permissions.write && (
            <Button asChild variant="outline">
              <Link href={`${base}/edit`}>
                <Pencil className="size-4" aria-hidden />
                Modifier
              </Link>
            </Button>
            )}
            {permissions.delete && <DeleteClientModal client={client} />}
            {permissions.write && (
            <>
            <Button asChild variant="outline">
              <Link href={`${base}?tab=communications`}>Préparer un message</Link>
            </Button>
            <Button asChild variant="accent">
              <Link href={`/cases/new?client=${client.id}`}>
                <FolderPlus aria-hidden />
                Nouveau dossier
              </Link>
            </Button>
            </>
            )}
          </>
          ) : undefined
        }
      />
      {query.ok === "client-cree" && (
        <div className="mb-4">
          <Notice tone="success" title="Fiche client créée">
            Vous pouvez maintenant ouvrir son premier dossier.
          </Notice>
        </div>
      )}
      {query.ok === "client-modifie" && (
        <div className="mb-4">
          <Notice tone="success" title="Fiche client mise à jour">
            Les modifications ont été enregistrées avec succès.
          </Notice>
        </div>
      )}
      {query.partenaire === "refuse" && (
        <div className="mb-4">
          <Notice tone="warning" title="Partenaire non modifié">
            La fiche est enregistrée, mais le partenaire n&apos;a pas pu changer : sa commission est peut-être déjà payée. Vérifiez sur la page du
            partenaire.
          </Notice>
        </div>
      )}
      {query.ok === "prospect-cree" && (
        <div className="mb-4">
          <Notice tone="success" title="Prospect enregistré">
            {followUps.length ? "Sa première relance est planifiée : elle apparaîtra dans les tâches le jour venu." : "Pensez à planifier sa relance ci-dessous."}
          </Notice>
        </div>
      )}

      {isProspect && (
        <Section title="Prospect à suivre" className="mb-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Origine du contact">{origin}</Field>
                <Field label="Premier contact">{formatDate(client.registeredAt, tz)}</Field>
                <Field label="Projet" className="sm:col-span-2">
                  {client.serviceMotive ? SERVICE_MOTIVES[client.serviceMotive] ?? client.serviceMotive : "Non précisé"}
                </Field>
              </dl>
              <p className="text-sm text-slate-600">
                Il devient client avec ce bouton, ou de lui-même dès qu&apos;un dossier lui est ouvert ou qu&apos;il est ajouté à un service. La fiche
                reste la même : rien n&apos;est recopié.
              </p>
              {permissions.write && <ConvertProspectButton clientId={client.id} name={`${client.firstName} ${client.lastName}`} />}
            </Card>
            <Card className="space-y-3">
              <h3 className="font-semibold text-navy-800">Relances</h3>
              {followUps.length === 0 ? (
                <p className="text-sm font-medium text-orange-800">Aucune relance prévue.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {followUps.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span className="text-slate-900">{t.title}</span>
                      <span className={new Date(t.dueAt).getTime() < now.getTime() ? "font-semibold text-red-700" : "text-slate-600"}>
                        {formatRelativeDay(t.dueAt, now, tz)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {permissions.write && <FollowUpForm clientId={client.id} today={today} />}
              <Link href={`${base}?tab=rendez-vous`} className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
                {nextAppointment ? `Rendez-vous ${formatRelativeDay(nextAppointment.startsAt, now, tz, !nextAppointment.allDay).toLowerCase()}` : "Programmer un rendez-vous"}
              </Link>
            </Card>
          </div>
        </Section>
      )}

      <TabNav
        label="Sections de la fiche client"
        active={tab}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: t.key === "apercu" ? base : `${base}?tab=${t.key}`,
          count: t.key === "dossiers" ? cases.length : t.key === "services" ? services.followed.length || undefined : t.key === "documents" ? missing.length || undefined : undefined,
        }))}
      />

      {tab === "apercu" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Section title="Identité & Profil">
              <Card>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Type de client">{CLIENT_TYPE[client.clientType]}</Field>
                  <Field label="Motif de service">
                    {client.serviceMotive ? SERVICE_MOTIVES[client.serviceMotive] ?? client.serviceMotive : "Non précisé"}
                  </Field>
                  <Field label="Sexe">{client.gender ? GENDER_OPTIONS[client.gender] ?? client.gender : "Non précisé"}</Field>
                  <Field label="Date de naissance">{client.birthDate ? formatDate(client.birthDate, tz) : "Non renseignée"}</Field>
                  <Field label="Nationalité">{client.nationality ?? countryName(client.residenceCountry)}</Field>
                  <Field label="Statut / État civil">
                    {client.maritalStatus ? MARITAL_STATUS[client.maritalStatus] ?? client.maritalStatus : "Non précisé"}
                  </Field>
                  <Field
                    label={client.idDocType ? ID_DOC_TYPES[client.idDocType] ?? "Pièce d'identité" : "Pièce d'identité"}
                    hint="Numéro complet visible par les responsables et les conseillers uniquement"
                  >
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Lock className="size-3.5 text-slate-500" aria-hidden />
                      {client.passportLast4 ? `•••• ${client.passportLast4}` : "Non renseignée"}
                    </span>
                  </Field>
                  <Field label="Inscription">{formatDate(client.registeredAt, tz)}</Field>
                  <Field label="Origine du contact">{origin}</Field>
                  {partner && (
                    <Field label="Apporté par">
                      <Link href={`/partners/${partner.id}`} className="font-medium text-navy-700 hover:underline">
                        {partner.name}
                      </Link>{" "}
                      <span className="font-mono text-xs text-slate-500">({partner.code})</span>
                    </Field>
                  )}
                  {client.convertedAt && <Field label="Devenu client">{formatDate(client.convertedAt, tz)}</Field>}
                </dl>
              </Card>
            </Section>

            <Section title="Coordonnées">
              <Card>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Pays de résidence">{countryName(client.residenceCountry)}</Field>
                  <Field label="Ville">{client.city}</Field>
                  {client.address && <Field label="Adresse" className="sm:col-span-2">{client.address}</Field>}
                  <Field label="Téléphone principal">{client.phoneE164}</Field>
                  <Field label="WhatsApp">{client.whatsappE164 ?? "Même numéro que le téléphone"}</Field>
                  <Field label="E-mail" className="sm:col-span-2">{client.email ?? "—"}</Field>
                  <Field label="Langue de communication" className="sm:col-span-2">
                    {LANGUAGES[client.preferredLanguage] ?? (client.preferredLanguage === "fr" ? "Français" : "Anglais")}
                  </Field>
                </dl>
              </Card>
            </Section>

            <Section title="Responsables & Tuteurs">
              <Card>
                {client.isSelfResponsible !== false && !client.guardian1 && !client.guardian2 ? (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="inline-block size-2 rounded-full bg-emerald-500" />
                    <span>Le client est son propre responsable (majeur / autonome).</span>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {client.guardian1 ? (
                      <div className="rounded-lg border border-slate-200 bg-surface/60 p-3.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-navy-800">Responsable 1</span>
                        <div className="mt-2 space-y-1 text-sm">
                          <p className="font-medium text-navy-900">{client.guardian1.name || "Non nommé"}</p>
                          <p className="text-slate-600">Tél : {client.guardian1.phone || "—"}</p>
                          {client.guardian1.whatsapp && <p className="text-slate-600">WhatsApp : {client.guardian1.whatsapp}</p>}
                        </div>
                      </div>
                    ) : null}
                    {client.guardian2 ? (
                      <div className="rounded-lg border border-slate-200 bg-surface/60 p-3.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-navy-800">Responsable 2</span>
                        <div className="mt-2 space-y-1 text-sm">
                          <p className="font-medium text-navy-900">{client.guardian2.name || "Non nommé"}</p>
                          <p className="text-slate-600">Tél : {client.guardian2.phone || "—"}</p>
                          {client.guardian2.whatsapp && <p className="text-slate-600">WhatsApp : {client.guardian2.whatsapp}</p>}
                        </div>
                      </div>
                    ) : null}
                    {!client.guardian1 && !client.guardian2 && (
                      <p className="text-sm text-slate-500">Aucun responsable enregistré.</p>
                    )}
                  </div>
                )}
              </Card>
            </Section>

            {client.notes && (
              <Card>
                <h3 className="text-sm font-semibold text-slate-800">Notes internes</h3>
                <p className="mt-1 text-sm text-slate-700">{client.notes}</p>
              </Card>
            )}
          </div>

          <Section title="En résumé">
            <Card>
              <dl className="space-y-3">
                <Field label="Dossiers actifs">{cases.filter((s) => s.travelCase.status === "active").length}</Field>
                <Field label="Services suivis">
                  {services.followed.length === 0 ? (
                    "Aucun"
                  ) : (
                    <ul className="space-y-1">
                      {services.followed.map(({ link, service }) => (
                        <li key={link.id} className="flex flex-wrap items-center gap-2">
                          <Link href={`/services/${service.id}`} className="font-medium text-navy-700 hover:underline">
                            {service.name}
                          </Link>
                          <StatusBadge spec={SERVICE_CLIENT_STATUS[link.status]} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>
                <Field label="Pièces obligatoires manquantes">{missing.length}</Field>
                <Field label="Solde dû">{balance ? formatMoney(balance, agency.currency) : "Aucun"}</Field>
                <Field label="Prochain rendez-vous">{nextAppointment ? `${nextAppointment.title} — ${formatRelativeDay(nextAppointment.startsAt, now, tz)}` : "Aucun"}</Field>
              </dl>
            </Card>
          </Section>
        </div>
      )}

      {tab === "dossiers" &&
        (cases.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Aucun dossier pour ce client"
            action={
              <Button asChild variant="accent">
                <Link href={`/cases/new?client=${client.id}`}>Ouvrir un dossier</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cases.map((s) => (
              <Link key={s.travelCase.id} href={`/cases/${s.travelCase.id}`} className="block rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.12)] hover:ring-2 hover:ring-navy-200">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{s.travelCase.reference}</span>
                  <StatusBadge spec={CASE_STATUS[s.travelCase.status]} />
                  {s.waitingOn && <StatusBadge spec={{ label: STEP_KIND[s.waitingOn].waitingLabel, tone: STEP_KIND[s.waitingOn].tone }} />}
                </span>
                <span className="mt-2 block font-medium text-navy-800">{s.travelCase.title}</span>
                <span className="block text-sm text-slate-600">
                  {caseKindLabel(s.travelCase.templateKey, CATEGORY_LABELS[s.travelCase.category])} · {countryName(s.travelCase.destinationCountry)}
                </span>
                <span className="mt-2 block text-sm text-slate-700">Étape : {s.current?.label ?? "Dossier clôturé"}</span>
                {s.finance.balanceMinor > 0 && <span className="block text-sm text-orange-800">Solde dû : {formatMoney(s.finance.balanceMinor, s.finance.currency)}</span>}
              </Link>
            ))}
          </div>
        ))}

      {tab === "services" && (
        <div className="space-y-6">
          {permissions.write && !client.archivedAt && (
            <Section title="Ajouter à un service">
              {services.available.length === 0 ? (
                <p className="text-sm text-slate-600">
                  {services.followed.length > 0 ? "Ce client suit déjà tous les services actifs de l'agence." : "L'agence n'a encore aucun service actif."}{" "}
                  <Link href="/services" className="font-medium text-navy-700 hover:underline">
                    Voir les services
                  </Link>
                </p>
              ) : (
                <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
                  <EnrollForm
                    clientId={client.id}
                    services={services.available.map((s) => ({ id: s.id, label: s.name }))}
                    cases={cases.map((s) => ({ id: s.travelCase.id, clientId: client.id, label: `${s.travelCase.reference} — ${s.travelCase.title}` }))}
                  />
                </div>
              )}
            </Section>
          )}
          <Section title="Services suivis">
            {services.followed.length === 0 ? (
              <EmptyState icon={BriefcaseBusiness} title="Ce client ne suit aucun service" description="Ajoutez-le à un service (hébergement, garant, AVI…) pour suivre où il en est." />
            ) : (
              <ul className="space-y-3">
                {services.followed.map(({ link, service, progress, bookings }) => {
                  const linkedCase = cases.find((s) => s.travelCase.id === link.caseId)?.travelCase;
                  return (
                    <li key={link.id} className="space-y-3 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400">
                            <BriefcaseBusiness className="size-4" aria-hidden />
                          </span>
                          <Link href={`/services/${service.id}`} className="font-semibold break-words text-navy-800 hover:underline">
                            {service.name}
                          </Link>
                        </span>
                        <StatusBadge spec={SERVICE_CLIENT_STATUS[link.status]} />
                      </div>
                      <p className="text-sm text-slate-600">
                        Dossier concerné :{" "}
                        {linkedCase ? (
                          <Link href={`/cases/${linkedCase.id}`} className="font-medium text-navy-700 hover:underline">
                            <span className="font-mono text-xs">{linkedCase.reference}</span> — {linkedCase.title}
                          </Link>
                        ) : (
                          "aucun"
                        )}{" "}
                        · ajouté le {formatDate(link.addedAt, tz)}
                      </p>
                      {link.note && <p className="rounded-lg bg-surface px-3 py-2 text-sm whitespace-pre-line text-slate-700">{link.note}</p>}
                      <ServiceProgress steps={progress.steps} canEdit={permissions.write && link.status !== "cancelled"} timezone={tz} />
                      <BookingPanel linkId={link.id} bookings={bookings} defaultCurrency={agency.currency} canEdit={permissions.write} />
                      {permissions.write && (
                        <div className="border-t border-slate-100 pt-3">
                          <ServiceClientActions
                            link={link}
                            who={`${client.firstName} ${client.lastName} du service « ${service.name} »`}
                            cases={cases.map((s) => ({ id: s.travelCase.id, label: `${s.travelCase.reference} — ${s.travelCase.title}` }))}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === "documents" && (
        <Section title="Pièces de tous ses dossiers">
          {requirements.length === 0 ? (
            <p className="text-sm text-slate-600">Aucune pièce attendue.</p>
          ) : (
            <ul className="space-y-2">
              {requirements.map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{r.label}</span>
                      <span className="block text-xs text-slate-500">
                        {caseReferences.get(r.caseId)} · {r.isRequired ? "Obligatoire" : "Facultatif"}
                      </span>
                    </span>
                    <StatusBadge spec={REQUIREMENT_STATUS[r.status]} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "rendez-vous" && permissions.write && !client.archivedAt && (
        <Section title="Programmer un rendez-vous" className="mb-6">
          <Card>
            <AppointmentForm
              fixedClientId={client.id}
              members={activeMembers(members)
                .filter((m) => m.role !== "viewer")
                .map((m) => ({ value: m.id, label: `${m.fullName} (${ROLE[m.role].label})` }))}
              defaultMemberId={client.assignedTo}
              defaultDate={today}
            />
          </Card>
          <p className="mt-3 text-sm text-slate-600">
            Pour un rendez-vous lié à une démarche (dépôt de visa, entretien d&apos;admission…), programmez-le depuis le dossier concerné.
          </p>
        </Section>
      )}
      {tab === "rendez-vous" && (
        <Section title="Rendez-vous et échéances">
          {appointments.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun rendez-vous enregistré.</p>
          ) : (
            <ul className="space-y-2">
              {appointments.map((a) => (
                <li key={a.id}>
                  <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block text-sm font-semibold text-navy-800">{formatRelativeDay(a.startsAt, now, tz, !a.allDay)}</span>
                      <span className="block text-sm text-slate-900">{a.title}</span>
                      <span className="block text-xs text-slate-500">{[APPOINTMENT_KIND[a.kind], a.location].filter(Boolean).join(" · ")}</span>
                    </span>
                    <StatusBadge spec={APPOINTMENT_STATUS[a.status]} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === "paiements" && (
        <Section title="Paiements">
          {payments.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun paiement enregistré.</p>
          ) : (
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id}>
                  <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold tabular-nums text-slate-900">
                        {formatMoney(p.amountMinor, p.currency)}
                        {p.status !== "recorded" && <StatusBadge spec={PAYMENT_STATUS[p.status]} />}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatDate(p.paidAt, tz)} · {p.methodLabel} · {caseReferences.get(p.caseId)}
                      </span>
                    </span>
                    <Link href={`/finance/receipts/${p.id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
                      {p.receiptNumber ? `Reçu ${p.receiptNumber}` : "Paiement à vérifier"}
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
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
                phoneDigits={client.isDemoFixture ? undefined : (client.whatsappE164 ?? client.phoneE164).replace(/\D/g, "")}
                templates={buildMessageTemplates({
                  firstName: client.firstName,
                  agencyName: agency.name,
                  caseReference: cases.find((s) => s.travelCase.status === "active")?.travelCase.reference,
                  missingDocuments: missing.map((r) => r.label),
                  nextAppointment: nextAppointment ? { title: nextAppointment.title, when: formatRelativeDay(nextAppointment.startsAt, now, tz, !nextAppointment.allDay).toLowerCase(), location: nextAppointment.location } : undefined,
                  balance: balance && permissions.financeRead ? formatMoney(balance, agency.currency) : undefined,
                })}
              />
              )}
            </Card>
          </Section>
          <Section title="Historique des communications">
            {communications.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune communication enregistrée. L&apos;envoi d&apos;e-mails sera disponible une fois un fournisseur configuré.</p>
            ) : (
              <ul className="space-y-2">
                {communications.map((c) => (
                  <li key={c.id}>
                    <Card className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="block text-sm font-medium text-slate-900">
                          {COMMUNICATION_CHANNEL[c.channel]} · {c.summary}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatRelativeDay(c.at, now, tz)}
                          {c.recipientEmail ? ` · ${c.recipientEmail}` : ""}
                          {c.actorId ? ` · ${members.find((m) => m.id === c.actorId)?.fullName ?? ""}` : " · Automatique"}
                        </span>
                      </div>
                      <StatusBadge spec={COMMUNICATION_STATUS[c.status]} />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === "historique" && (
        <Section title="Historique">
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-navy-700" aria-hidden />
                <span>
                  <span className="text-slate-900">{e.text}</span>
                  <span className="block text-xs text-slate-500">
                    {formatDate(e.at, tz, "dateTime")} · {members.find((m) => m.id === e.actorId)?.fullName}
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
