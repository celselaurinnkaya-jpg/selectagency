import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { BriefcaseBusiness, CheckCircle2, Clock, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { SERVICE_CLIENT_STATUS } from "@/lib/domain/labels";
import type { AgencyService } from "@/lib/domain/types";
import { formatMoney } from "@/lib/format";
import { listServices, type ServiceCounts } from "@/features/services/queries";
import { SERVICE_SUGGESTIONS } from "@/features/services/suggestions";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage({ searchParams }: PageProps<"/services">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Services searchParams={searchParams} />
    </Suspense>
  );
}

async function Services({ searchParams }: Pick<PageProps<"/services">, "searchParams">) {
  const [params, { services, totals, clientsFollowed, canManage: canManageRole, locked }] = await Promise.all([searchParams, listServices()]);
  const canManage = canManageRole && !locked;
  const active = services.filter((s) => s.service.isActive);
  const inactive = services.filter((s) => !s.service.isActive);

  return (
    <>
      <PageHeader
        title="Services"
        description="Les services que propose votre agence : hébergement, garant, AVI, admissions… Ouvrez un service pour y ajouter des clients et suivre où en est chacun."
        actions={
          canManage ? (
            <Button asChild variant="accent">
              <Link href="/services/new">
                <Plus aria-hidden />
                Nouveau service
              </Link>
            </Button>
          ) : undefined
        }
      />
      {locked && (
        <div className="mb-4">
          <FeatureLocked feature="services" />
        </div>
      )}
      {params.ok === "service-supprime" && (
        <div className="mb-4">
          <Notice tone="success" title="Service supprimé">
            Ses clients en ont été retirés. Leurs fiches, dossiers et paiements n&apos;ont pas changé.
          </Notice>
        </div>
      )}

      {services.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="Aucun service pour le moment"
          description={
            locked
              ? "Les services sont inclus dans les formules PRO et BUSINESS."
              : canManage
              ? "Créez les services que propose votre agence. Vous pourrez ensuite y ajouter vos clients et suivre chacun d'eux."
              : "Le propriétaire ou un administrateur de l'agence crée la liste des services."
          }
          action={
            canManage ? (
              <div className="space-y-4">
                <Button asChild variant="accent">
                  <Link href="/services/new">
                    <Plus aria-hidden />
                    Créer un service
                  </Link>
                </Button>
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Ou partez d&apos;une suggestion :</p>
                  <ul className="flex max-w-xl flex-wrap justify-center gap-2">
                    {SERVICE_SUGGESTIONS.slice(0, 8).map((s) => (
                      <li key={s.name}>
                        <Link
                          href={`/services/new?nom=${encodeURIComponent(s.name)}`}
                          className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:border-navy-300 hover:text-navy-800"
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Services proposés" value={active.length} hint={inactive.length ? `${inactive.length} désactivé${inactive.length > 1 ? "s" : ""}` : undefined} icon={BriefcaseBusiness} />
            <StatCard label="Clients suivis" value={clientsFollowed} hint="Au moins un service en cours" icon={Users} />
            <StatCard
              label="En attente"
              value={totals.waiting_client + totals.waiting_external}
              hint={`${totals.waiting_client} côté client · ${totals.waiting_external} côté tiers`}
              icon={Clock}
              tone={totals.waiting_client + totals.waiting_external > 0 ? "warning" : "navy"}
            />
            <StatCard label="Terminés" value={totals.completed} hint="Tous services confondus" icon={CheckCircle2} tone="success" />
          </div>

          <Section title="Services de l'agence">
            <ServiceGrid items={active} />
          </Section>
          {inactive.length > 0 && (
            <Section title="Services désactivés">
              <p className="mb-3 text-sm text-slate-600">Ils restent consultables avec leurs clients, mais n&apos;acceptent plus de nouveaux clients.</p>
              <ServiceGrid items={inactive} />
            </Section>
          )}
        </div>
      )}
    </>
  );
}

function ServiceGrid({ items }: { items: { service: AgencyService; counts: ServiceCounts }[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-600">Aucun service actif.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ service, counts }) => (
        <li key={service.id}>
          <Link
            href={`/services/${service.id}`}
            className="flex h-full flex-col gap-3 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)] transition hover:ring-2 hover:ring-navy-200"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400">
                <BriefcaseBusiness className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold break-words text-navy-800">{service.name}</p>
                <p className="text-sm text-slate-600 tabular-nums">
                  {service.priceMinor && service.currency ? `Tarif indicatif : ${formatMoney(service.priceMinor, service.currency)}` : "Tarif non précisé"}
                </p>
              </div>
            </div>
            {service.description && <p className="line-clamp-2 text-sm text-slate-600">{service.description}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-slate-800 tabular-nums">
                {counts.total} client{counts.total > 1 ? "s" : ""}
              </span>
              {counts.in_progress > 0 && <StatusBadge spec={{ ...SERVICE_CLIENT_STATUS.in_progress, label: `${counts.in_progress} en cours` }} />}
              {counts.waiting_client + counts.waiting_external > 0 && (
                <StatusBadge spec={{ label: `${counts.waiting_client + counts.waiting_external} en attente`, tone: "warning" }} />
              )}
              {counts.completed > 0 && <StatusBadge spec={{ ...SERVICE_CLIENT_STATUS.completed, label: `${counts.completed} terminé${counts.completed > 1 ? "s" : ""}` }} />}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
