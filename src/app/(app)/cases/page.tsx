import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { FolderKanban, FolderPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterForm } from "@/components/shared/FilterForm";
import { selectClass } from "@/components/shared/form";
import { Pills, withParams } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { CASE_STATUS, CATEGORY_LABELS, CATEGORY_SHORT_LABELS, PRIORITY, STEP_KIND } from "@/lib/domain/labels";
import type { CaseCategory, CaseStatus, StepKind } from "@/lib/domain/types";
import { formatMoney, formatRelativeDay } from "@/lib/format";
import { listCases } from "@/features/cases/queries";
import type { CaseSummary } from "@/features/cases/summary";

export const metadata: Metadata = { title: "Dossiers" };

const WAITING_COLUMNS: StepKind[] = ["agency_action", "client_action", "external_event", "outcome"];

export default function CasesPage({ searchParams }: PageProps<"/cases">) {
  return (
    <>
      <PageHeader
        title="Dossiers"
        description="Chaque dossier suit les étapes de son modèle. Le badge indique qui doit agir : l'agence, le client ou un organisme extérieur."
        actions={
          <Button asChild variant="accent">
            <Link href="/cases/new">
              <FolderPlus aria-hidden />
              Nouveau dossier
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <CasesList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CasesList({ searchParams }: Pick<PageProps<"/cases">, "searchParams">) {
  const params = await searchParams;
  const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  const current = {
    categorie: str(params.categorie),
    statut: str(params.statut),
    destination: str(params.destination),
    attente: str(params.attente),
    q: str(params.q),
    vue: str(params.vue),
  };
  const category = current.categorie && current.categorie in CATEGORY_LABELS ? (current.categorie as CaseCategory) : undefined;
  const status = current.statut === "all" ? "all" : current.statut && current.statut in CASE_STATUS ? (current.statut as CaseStatus) : "active";
  const waiting = current.attente && current.attente in STEP_KIND ? (current.attente as StepKind) : undefined;
  const view = current.vue === "colonnes" ? "colonnes" : "liste";

  const { rows, agency, destinations, now } = await listCases({ q: current.q, category, status, destination: current.destination, waiting });
  const tz = agency.timezone;

  return (
    <>
      <Pills
        label="Type de projet"
        active={category ?? "tous"}
        items={[
          { key: "tous", label: "Tous", href: withParams("/cases", current, { categorie: undefined }) },
          ...Object.entries(CATEGORY_SHORT_LABELS).map(([key, label]) => ({ key, label, href: withParams("/cases", current, { categorie: key }) })),
        ]}
      />

      <FilterForm action="/cases">
        {category && <input type="hidden" name="categorie" value={category} />}
        {view === "colonnes" && <input type="hidden" name="vue" value="colonnes" />}
        <div className="flex-1 sm:min-w-56">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Rechercher
          </label>
          <Input id="q" name="q" type="search" defaultValue={current.q} placeholder="Référence, client, intitulé" />
        </div>
        <div>
          <label htmlFor="statut" className="mb-1 block text-sm font-medium text-slate-700">
            Statut
          </label>
          <select id="statut" name="statut" defaultValue={status === "active" ? "" : status} className={selectClass}>
            <option value="">Actifs</option>
            <option value="closed">Clôturés</option>
            <option value="on_hold">En pause</option>
            <option value="all">Tous</option>
          </select>
        </div>
        <div>
          <label htmlFor="attente" className="mb-1 block text-sm font-medium text-slate-700">
            Qui doit agir
          </label>
          <select id="attente" name="attente" defaultValue={waiting ?? ""} className={selectClass}>
            <option value="">Tout le monde</option>
            <option value="agency_action">L&apos;agence</option>
            <option value="client_action">Le client</option>
            <option value="external_event">Un organisme extérieur</option>
          </select>
        </div>
        <div>
          <label htmlFor="destination" className="mb-1 block text-sm font-medium text-slate-700">
            Destination
          </label>
          <select id="destination" name="destination" defaultValue={current.destination ?? ""} className={selectClass}>
            <option value="">Toutes</option>
            {destinations.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">
          <Search aria-hidden />
          Filtrer
        </Button>
      </FilterForm>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600" aria-live="polite">
          {rows.length} dossier{rows.length > 1 ? "s" : ""}
        </p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm" role="group" aria-label="Affichage">
          {[
            { key: "liste", label: "Liste" },
            { key: "colonnes", label: "Par responsable" },
          ].map((option) => (
            <Link
              key={option.key}
              href={withParams("/cases", current, { vue: option.key === "liste" ? undefined : option.key })}
              aria-current={view === option.key ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${view === option.key ? "bg-navy-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aucun dossier ne correspond"
          description="Modifiez les filtres, ou ouvrez un nouveau dossier."
          action={
            <Button asChild variant="outline">
              <Link href="/cases">Effacer les filtres</Link>
            </Button>
          }
        />
      ) : view === "colonnes" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {WAITING_COLUMNS.map((kind) => {
            const items = rows.filter((s) => s.waitingOn === kind);
            return (
              <section key={kind} className="rounded-2xl bg-surface p-3">
                <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-navy-800">
                  {STEP_KIND[kind].waitingLabel}
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{items.length}</span>
                </h2>
                <ul className="space-y-2">
                  {items.map((s) => (
                    <li key={s.travelCase.id}>
                      <CaseCard summary={s} now={now} tz={tz} />
                    </li>
                  ))}
                  {items.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500">Aucun dossier</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs font-semibold text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Dossier</th>
                  <th scope="col" className="px-4 py-3">Client</th>
                  <th scope="col" className="px-4 py-3">Étape en cours</th>
                  <th scope="col" className="px-4 py-3">Prochaine action</th>
                  <th scope="col" className="px-4 py-3">Pièces</th>
                  <th scope="col" className="px-4 py-3">Solde dû</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.travelCase.id} className="align-top hover:bg-navy-50/50">
                    <td className="px-4 py-3">
                      <Link href={`/cases/${s.travelCase.id}`} className="font-medium text-navy-800 hover:underline">
                        {s.travelCase.title}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        <span className="font-mono">{s.travelCase.reference}</span> · {CATEGORY_SHORT_LABELS[s.travelCase.category]} · {countryName(s.travelCase.destinationCountry)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {s.client.firstName} {s.client.lastName}
                      <span className="block text-xs text-slate-500">{s.assignee?.fullName}</span>
                    </td>
                    <td className="px-4 py-3">
                      {s.current ? (
                        <>
                          <span className="block text-slate-800">{s.current.label}</span>
                          <StatusBadge className="mt-1" spec={{ label: STEP_KIND[s.current.kind].waitingLabel, tone: STEP_KIND[s.current.kind].tone }} />
                        </>
                      ) : (
                        <StatusBadge spec={CASE_STATUS[s.travelCase.status]} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-slate-800">{s.travelCase.nextAction ?? "—"}</span>
                      {s.travelCase.nextActionDueAt && (
                        <span className={`text-xs ${s.isOverdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
                          {s.isOverdue && "En retard · "}
                          {formatRelativeDay(s.travelCase.nextActionDueAt, now, tz, false)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {s.missingRequired ? <span className="text-red-700">{s.missingRequired} manquante(s)</span> : "Complètes"}
                      {s.toReview > 0 && <span className="block text-xs text-orange-800">{s.toReview} à examiner</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{s.finance.balanceMinor ? formatMoney(s.finance.balanceMinor, s.finance.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 lg:hidden">
            {rows.map((s) => (
              <li key={s.travelCase.id}>
                <CaseCard summary={s} now={now} tz={tz} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function CaseCard({ summary: s, now, tz }: { summary: CaseSummary; now: Date; tz: string }) {
  return (
    <Link href={`/cases/${s.travelCase.id}`} className="block rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.12)] hover:ring-2 hover:ring-navy-200">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{s.travelCase.reference}</span>
        {s.travelCase.priority === "urgent" || s.travelCase.priority === "high" ? <StatusBadge spec={PRIORITY[s.travelCase.priority]} /> : null}
      </span>
      <span className="mt-1 block font-medium text-navy-800">{s.travelCase.title}</span>
      <span className="block text-sm text-slate-600">
        {s.client.firstName} {s.client.lastName} · {countryName(s.travelCase.destinationCountry)}
      </span>
      {s.current && <span className="mt-2 block text-sm text-slate-800">Étape : {s.current.label}</span>}
      {s.travelCase.nextActionDueAt && (
        <span className={`block text-sm ${s.isOverdue ? "font-medium text-red-700" : "text-slate-600"}`}>
          {s.isOverdue ? "En retard · " : "Échéance · "}
          {formatRelativeDay(s.travelCase.nextActionDueAt, now, tz, false)}
        </span>
      )}
      {(s.missingRequired > 0 || s.finance.balanceMinor > 0) && (
        <span className="mt-2 flex flex-wrap gap-x-3 text-sm">
          {s.missingRequired > 0 && <span className="text-red-700">{s.missingRequired} pièce(s) manquante(s)</span>}
          {s.finance.balanceMinor > 0 && <span className="text-orange-800">Solde {formatMoney(s.finance.balanceMinor, s.finance.currency)}</span>}
        </span>
      )}
    </Link>
  );
}
