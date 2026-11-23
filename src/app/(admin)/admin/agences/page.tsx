import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { selectClass } from "@/components/shared/form";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { formatDate } from "@/lib/format";
import { agencyEffectiveStatus, agencyStatus, CONSOLE_TIMEZONE, displayCity, formatBytes } from "@/features/admin/display";
import { listAgencies, type AgencyRow } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Agences" };

const FILTERS = [
  { key: "tous", label: "Clientes" },
  { key: "attention", label: "À surveiller" },
  { key: "trialing", label: "En essai" },
  { key: "active", label: "Actives" },
  { key: "bloquees", label: "En lecture seule" },
  { key: "internes", label: "Internes" },
  { key: "demo", label: "Démonstrations" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const SORTS = [
  { key: "recentes", label: "Inscription (récentes d'abord)" },
  { key: "nom", label: "Nom (A → Z)" },
  { key: "activite", label: "Dernière activité" },
  { key: "echeance", label: "Échéance (la plus proche)" },
  { key: "clients", label: "Nombre de clients" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const time = (iso?: string) => (iso ? new Date(iso).getTime() : undefined);

const SORTERS: Record<SortKey, (a: AgencyRow, b: AgencyRow) => number> = {
  recentes: (a, b) => b.createdAt.localeCompare(a.createdAt),
  nom: (a, b) => a.name.localeCompare(b.name, "fr"),
  activite: (a, b) => (time(b.lastActivityAt) ?? 0) - (time(a.lastActivityAt) ?? 0),
  echeance: (a, b) => (time(a.currentPeriodEnd) ?? Number.MAX_SAFE_INTEGER) - (time(b.currentPeriodEnd) ?? Number.MAX_SAFE_INTEGER),
  clients: (a, b) => b.clients - a.clients,
};

export default function AgenciesPage({ searchParams }: PageProps<"/admin/agences">) {
  return (
    <>
      <PageHeader
        title="Agences"
        description="Toutes les agences inscrites sur SELECT Agency, leur abonnement et des chiffres d'activité (sans aucune donnée de leurs clients)."
        actions={
          <Button asChild variant="outline">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement d'un fichier CSV (route), pas une page */}
            <a href="/admin/export/agences" download>
              <Download aria-hidden />
              Exporter (CSV)
            </a>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Agencies searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Agencies({ searchParams }: Pick<PageProps<"/admin/agences">, "searchParams">) {
  const [{ statut, q, tri }, agencies] = await Promise.all([searchParams, listAgencies()]);
  const filter: FilterKey = FILTERS.some((f) => f.key === statut) ? (statut as FilterKey) : "tous";
  const sort: SortKey = SORTS.some((s) => s.key === tri) ? (tri as SortKey) : "recentes";
  const query = typeof q === "string" ? q.trim() : "";
  const now = new Date();
  const matches: Record<FilterKey, (a: AgencyRow) => boolean> = {
    tous: (a) => !a.isDemo && !a.isInternal,
    attention: (a) => !!agencyStatus(a, now).attention,
    trialing: (a) => !a.isDemo && !a.isInternal && agencyEffectiveStatus(a, now) === "trialing",
    active: (a) => !a.isInternal && (a.status === "active" || a.status === "past_due"),
    bloquees: (a) => {
      if (a.isDemo || !a.status) return false;
      const s = agencyEffectiveStatus(a, now);
      return s === "trial_expired" || s === "suspended" || s === "cancelled" || s === "overdue";
    },
    internes: (a) => a.isInternal,
    demo: (a) => a.isDemo,
  };
  const searched = query
    ? agencies.filter((a) => normalize(`${a.name} ${a.ownerName ?? ""} ${a.ownerEmail ?? ""} ${a.city} ${countryName(a.countryCode)}`).includes(normalize(query)))
    : agencies;
  const rows = searched.filter(matches[filter]).sort(SORTERS[sort]);
  const href = (params: { statut?: FilterKey }) => {
    const search = new URLSearchParams();
    const s = params.statut ?? filter;
    if (s !== "tous") search.set("statut", s);
    if (query) search.set("q", query);
    if (sort !== "recentes") search.set("tri", sort);
    const text = search.toString();
    return `/admin/agences${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <Form action="/admin/agences" className="flex flex-col gap-2 sm:flex-row">
        {filter !== "tous" && <input type="hidden" name="statut" value={filter} />}
        <label htmlFor="agences-q" className="sr-only">
          Rechercher une agence
        </label>
        <Input id="agences-q" name="q" type="search" defaultValue={query} placeholder="Nom, propriétaire, e-mail, ville, pays" className="flex-1" />
        <label htmlFor="agences-tri" className="sr-only">
          Trier les agences
        </label>
        <select id="agences-tri" name="tri" defaultValue={sort} className={`${selectClass} sm:w-64`}>
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit">
          <Search aria-hidden />
          Afficher
        </Button>
      </Form>
      <Pills
        label="Filtrer les agences"
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: href({ statut: f.key }), count: searched.filter(matches[f.key]).length }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Building2} title="Aucune agence dans cette liste" description={query ? `Aucun résultat pour « ${query} ».` : undefined} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((agency) => {
            const { spec, attention } = agencyStatus(agency, now);
            return (
              <li key={agency.id}>
                <Link href={`/admin/agences/${agency.id}`} className="block h-full rounded-xl transition hover:ring-2 hover:ring-navy-200">
                  <Card className="h-full space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy-800">{agency.name}</span>
                        <span className="block truncate text-sm text-slate-600">
                          {[displayCity(agency.city), countryName(agency.countryCode)].filter(Boolean).join(", ")} · inscrite le{" "}
                          {formatDate(agency.createdAt, CONSOLE_TIMEZONE)}
                        </span>
                      </span>
                      <StatusBadge spec={spec} />
                    </div>
                    {attention && <p className="text-sm font-medium text-orange-800">{attention}</p>}
                    <dl className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 text-center text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Membres</dt>
                        <dd className="font-semibold tabular-nums">{agency.members}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Clients</dt>
                        <dd className="font-semibold tabular-nums">{agency.clients}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Dossiers actifs</dt>
                        <dd className="font-semibold tabular-nums">{agency.casesActive}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Stockage</dt>
                        <dd className="font-semibold tabular-nums">{formatBytes(agency.storageBytes)}</dd>
                      </div>
                    </dl>
                    <p className="truncate text-xs text-slate-500">
                      {agency.planName ? `Formule ${agency.planName}` : "Sans formule"}
                      {agency.currentPeriodEnd && ` · échéance le ${formatDate(agency.currentPeriodEnd, CONSOLE_TIMEZONE)}`}
                      {agency.ownerName && ` · propriétaire : ${agency.ownerName}`}
                      {agency.lastActivityAt && ` · dernière activité le ${formatDate(agency.lastActivityAt, CONSOLE_TIMEZONE)}`}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
