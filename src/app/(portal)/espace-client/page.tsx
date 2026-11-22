import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarDays, Check, FolderOpen } from "lucide-react";
import { cn } from "cn";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { CASE_OUTCOME, CASE_STATUS, REQUIREMENT_STATUS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { getClientPortal } from "@/features/client-portal/queries";
import { PortalDocumentUpload } from "@/features/client-portal/ClientPortalForms";

export const metadata: Metadata = { title: "Espace client" };

// Espace client : en lecture seule, l'avancement de ses dossiers, ses pièces et son prochain rendez-vous ;
// il dépose lui-même les pièces encore attendues. Rien d'autre n'est lisible pour lui (fonction client_portal).

const EXPECTED = new Set(["not_received", "to_correct", "expired"]);

export default function ClientPortalPage() {
  return (
    <>
      <PageHeader title="Mon espace client" description="L'avancement de votre dossier et les documents à envoyer à votre agence." />
      <Suspense fallback={<PageSkeleton />}>
        <Portal />
      </Suspense>
    </>
  );
}

async function Portal() {
  const { agencies } = await getClientPortal();
  if (agencies.length === 0) {
    return <EmptyState icon={FolderOpen} title="Aucun espace ouvert" description="Votre agence ne vous a pas encore ouvert d'espace client, ou l'accès a été retiré." />;
  }
  return (
    <div className="space-y-8">
      {agencies.map((agency) => (
        <div key={agency.organization_id} className="space-y-4">
          <p className="text-sm text-slate-700">
            Bonjour {agency.client_first_name}, voici vos dossiers chez <strong className="text-navy-800">{agency.agency_name}</strong>.
            {(agency.agency_phone || agency.agency_email) && (
              <> Pour toute question : {[agency.agency_phone, agency.agency_email].filter(Boolean).join(" · ")}.</>
            )}
          </p>
          {agency.cases.length === 0 && <Notice>Aucun dossier en cours pour le moment.</Notice>}
          {agency.cases.map((c) => {
            const current = c.steps.find((s) => s.status === "in_progress");
            const done = c.steps.filter((s) => s.status === "done").length;
            const expected = c.requirements.filter((r) => EXPECTED.has(r.status));
            return (
              <Section
                key={c.id}
                title={`${c.title} · ${countryName(c.destination_country)}`}
                action={<StatusBadge spec={c.outcome !== "pending" ? CASE_OUTCOME[c.outcome] : CASE_STATUS[c.status]} />}
              >
                <div className="space-y-4">
                  <Card className="space-y-2">
                    <p className="font-mono text-xs text-slate-500">{c.reference}</p>
                    <p className="text-sm text-slate-700">
                      {current ? (
                        <>
                          Étape en cours : <strong className="text-navy-800">{current.label}</strong>
                        </>
                      ) : (
                        "Toutes les étapes sont terminées."
                      )}
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={c.steps.length} aria-valuenow={done} aria-label="Avancement du dossier">
                      <div className="h-full rounded-full bg-navy-800" style={{ width: `${c.steps.length ? (done / c.steps.length) * 100 : 0}%` }} />
                    </div>
                    <ol className="mt-2 space-y-1 text-sm">
                      {c.steps
                        .filter((s) => s.status !== "skipped")
                        .map((s, i) => (
                          <li key={`${s.label}-${i}`} className={cn("flex items-center gap-2", s.status === "pending" ? "text-slate-500" : "text-slate-900")}>
                            <span
                              aria-hidden
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                                s.status === "done" ? "border-emerald-600 bg-emerald-600 text-white" : s.status === "in_progress" ? "border-navy-800 bg-navy-800 text-citron-400" : "border-slate-300",
                              )}
                            >
                              {s.status === "done" && <Check className="size-3" />}
                            </span>
                            <span className={s.status === "in_progress" ? "font-semibold" : undefined}>{s.label}</span>
                          </li>
                        ))}
                    </ol>
                  </Card>

                  {c.next_appointment && (
                    <Card className="flex items-start gap-3">
                      <CalendarDays className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
                      <span className="text-sm text-slate-700">
                        Prochain rendez-vous : <strong className="text-slate-900">{c.next_appointment.title}</strong>,{" "}
                        {formatDate(c.next_appointment.starts_at, agency.agency_timezone, c.next_appointment.all_day ? "date" : "dateTime")}
                        {c.next_appointment.location && `, ${c.next_appointment.location}`}.
                      </span>
                    </Card>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-navy-800">
                      Vos documents {expected.length > 0 && <span className="text-sm font-normal text-orange-800">— {expected.length} à envoyer</span>}
                    </h3>
                    <ul className="space-y-2">
                      {c.requirements.map((r) => (
                        <li key={r.id}>
                          <Card className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-slate-900">
                                {r.label}
                                {!r.is_required && <span className="ml-1 text-xs font-normal text-slate-500">(facultatif)</span>}
                              </span>
                              <StatusBadge spec={REQUIREMENT_STATUS[r.status]} />
                            </div>
                            {r.comment && <p className="text-sm text-red-800">À corriger : {r.comment}</p>}
                            {c.status === "active" && EXPECTED.has(r.status) && (
                              <PortalDocumentUpload organizationId={agency.organization_id} caseId={c.id} requirementId={r.id} label={r.label} />
                            )}
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Section>
            );
          })}
        </div>
      ))}
      <Notice>
        Votre agence vérifie chaque document reçu. « Vérifié par l&apos;agence » est un contrôle interne, jamais une décision d&apos;une ambassade, d&apos;un
        consulat ou d&apos;une administration.
      </Notice>
    </div>
  );
}
