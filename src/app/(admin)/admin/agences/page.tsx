import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { effectiveStatus } from "@/lib/domain/subscription";
import { formatDate } from "@/lib/format";
import { agencyStatus, CONSOLE_TIMEZONE, formatBytes } from "@/features/admin/display";
import { listAgencies, type AgencyRow } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Agences" };

const FILTERS = [
  { key: "tous", label: "Réelles" },
  { key: "attention", label: "À surveiller" },
  { key: "trialing", label: "En essai" },
  { key: "active", label: "Actives" },
  { key: "bloquees", label: "En lecture seule" },
  { key: "demo", label: "Démonstrations" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function AgenciesPage({ searchParams }: PageProps<"/admin/agences">) {
  return (
    <>
      <PageHeader title="Agences" description="Toutes les agences inscrites sur SELECT Agency, leur abonnement et des chiffres d'activité (sans aucune donnée de leurs clients)." />
      <Suspense fallback={<PageSkeleton />}>
        <Agencies searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Agencies({ searchParams }: Pick<PageProps<"/admin/agences">, "searchParams">) {
  const [{ statut }, agencies] = await Promise.all([searchParams, listAgencies()]);
  const filter: FilterKey = FILTERS.some((f) => f.key === statut) ? (statut as FilterKey) : "tous";
  const now = new Date();
  const matches: Record<FilterKey, (a: AgencyRow) => boolean> = {
    tous: (a) => !a.isDemo,
    attention: (a) => !!agencyStatus(a, now).attention,
    trialing: (a) => !a.isDemo && !!a.status && effectiveStatus({ status: a.status, trialEndsAt: a.trialEndsAt }, now) === "trialing",
    active: (a) => a.status === "active" || a.status === "past_due",
    bloquees: (a) => {
      if (a.isDemo || !a.status) return false;
      const s = effectiveStatus({ status: a.status, trialEndsAt: a.trialEndsAt }, now);
      return s === "trial_expired" || s === "suspended" || s === "cancelled";
    },
    demo: (a) => a.isDemo,
  };
  const rows = agencies.filter(matches[filter]);

  return (
    <>
      <Pills
        label="Filtrer les agences"
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "tous" ? "/admin/agences" : `/admin/agences?statut=${f.key}`, count: agencies.filter(matches[f.key]).length }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Building2} title="Aucune agence dans cette liste" />
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
                          {[agency.city, countryName(agency.countryCode)].filter(Boolean).join(", ")} · inscrite le {formatDate(agency.createdAt, CONSOLE_TIMEZONE)}
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
    </>
  );
}
