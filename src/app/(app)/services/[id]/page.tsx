import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Clock, FolderKanban, Pencil, Phone, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { SERVICE_CLIENT_STATUS } from "@/lib/domain/labels";
import type { ServiceClientStatus } from "@/lib/domain/types";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { getService, SERVICE_STATUS_ORDER } from "@/features/services/queries";
import { DeleteServiceButton, EnrollForm, ServiceClientActions } from "@/features/services/ServiceForms";

export const metadata: Metadata = { title: "Service" };

export default function ServicePage({ params, searchParams }: PageProps<"/services/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ServiceDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ServiceDetail({ params, searchParams }: PageProps<"/services/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getService(id);
  if (!detail) notFound();
  const { service, rows, counts, candidates, cases, agency, permissions } = detail;
  const tz = agency.timezone;
  const filter = SERVICE_STATUS_ORDER.find((s) => s === query.etat);
  const shown = filter ? rows.filter((r) => r.link.status === filter) : rows;
  const base = `/services/${service.id}`;

  return (
    <>
      <PageHeader
        back={{ href: "/services", label: "Retour aux services" }}
        eyebrow={!service.isActive ? <StatusBadge spec={{ label: "Service désactivé", tone: "neutral" }} /> : undefined}
        title={service.name}
        description={
          <>
            {service.description || "Aucune description."}
            <span className="mt-1 block font-medium text-slate-700 tabular-nums">
              {service.priceMinor && service.currency ? `Tarif indicatif : ${formatMoney(service.priceMinor, service.currency)}` : "Tarif non précisé"}
            </span>
          </>
        }
        actions={
          permissions.manage ? (
            <>
              <Button asChild variant="outline">
                <Link href={`${base}/edit`}>
                  <Pencil aria-hidden />
                  Modifier
                </Link>
              </Button>
              <DeleteServiceButton serviceId={service.id} name={service.name} clientCount={counts.total} />
            </>
          ) : undefined
        }
      />
      {query.ok === "service-cree" && (
        <div className="mb-4">
          <Notice tone="success" title="Service créé">
            Ajoutez maintenant les clients qui suivent ce service.
          </Notice>
        </div>
      )}
      {query.ok === "service-modifie" && (
        <div className="mb-4">
          <Notice tone="success" title="Service mis à jour">
            Les modifications ont été enregistrées.
          </Notice>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Clients" value={counts.total} hint="Dans ce service" icon={Users} />
          <StatCard label="En cours" value={counts.in_progress} hint="L'agence avance" icon={FolderKanban} href={`${base}?etat=in_progress`} />
          <StatCard
            label="En attente"
            value={counts.waiting_client + counts.waiting_external}
            hint={`${counts.waiting_client} côté client · ${counts.waiting_external} côté tiers`}
            icon={Clock}
            tone={counts.waiting_client + counts.waiting_external > 0 ? "warning" : "navy"}
          />
          <StatCard label="Terminés" value={counts.completed} hint="Service rendu" icon={CheckCircle2} tone="success" href={`${base}?etat=completed`} />
        </div>

        {permissions.enroll && (
          <Section title="Ajouter un client">
            {!service.isActive ? (
              <Notice tone="warning">Ce service est désactivé. Pour y ajouter des clients, un responsable doit le réactiver (Modifier).</Notice>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-slate-600">
                Tous vos clients actifs suivent déjà ce service.{" "}
                <Link href="/clients/new" className="font-medium text-navy-700 hover:underline">
                  Enregistrer un nouveau client
                </Link>
              </p>
            ) : (
              <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
                <EnrollForm serviceId={service.id} clients={candidates} cases={cases} />
              </div>
            )}
          </Section>
        )}

        <Section title="Clients du service">
          {rows.length > 0 && (
            <Pills
              label="Filtrer par état du suivi"
              active={filter ?? "tous"}
              items={[
                { key: "tous", label: "Tous", href: base, count: counts.total },
                ...SERVICE_STATUS_ORDER.map((status: ServiceClientStatus) => ({
                  key: status,
                  label: SERVICE_CLIENT_STATUS[status].label,
                  href: `${base}?etat=${status}`,
                  count: counts[status],
                })),
              ]}
            />
          )}
          {shown.length === 0 ? (
            <EmptyState
              icon={Users}
              title={rows.length === 0 ? "Aucun client dans ce service" : "Aucun client à cet état"}
              description={
                rows.length === 0
                  ? permissions.enroll && service.isActive
                    ? "Ajoutez un client avec le formulaire ci-dessus."
                    : undefined
                  : "Choisissez un autre état, ou affichez tous les clients."
              }
              action={
                rows.length > 0 ? (
                  <Button asChild variant="outline">
                    <Link href={base}>Afficher tous les clients</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-3">
              {shown.map(({ link, client, cases: clientCases, linkedCase, balances, addedBy }) => {
                const fullName = `${client.firstName} ${client.lastName}`;
                const clientUrl = `/clients/${client.id}`;
                return (
                  <li key={link.id} className="space-y-3 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-citron-400">
                          {initials(fullName)}
                        </span>
                        <div className="min-w-0">
                          <Link href={clientUrl} className="font-semibold break-words text-navy-800 hover:underline">
                            {fullName}
                          </Link>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                            <span className="font-mono text-xs text-slate-500">{client.reference}</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Phone className="size-3.5" aria-hidden />
                              {client.phoneE164}
                            </span>
                          </p>
                        </div>
                      </div>
                      <StatusBadge spec={SERVICE_CLIENT_STATUS[link.status]} className="self-start" />
                    </div>

                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">Dossier concerné</dt>
                        <dd className="mt-0.5">
                          {linkedCase ? (
                            <Link href={`/cases/${linkedCase.id}`} className="font-medium text-navy-700 hover:underline">
                              <span className="font-mono text-xs">{linkedCase.reference}</span> — {linkedCase.title}
                            </Link>
                          ) : (
                            <span className="text-slate-600">
                              Aucun · {clientCases.length} dossier{clientCases.length > 1 ? "s" : ""} au total
                            </span>
                          )}
                        </dd>
                      </div>
                      {balances && (
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Reste à payer (tous dossiers)</dt>
                          <dd className="mt-0.5 tabular-nums">
                            {balances.length === 0 ? (
                              <span className="text-slate-600">Aucune prestation</span>
                            ) : (
                              balances.map((b) =>
                                b.balanceMinor > 0 ? (
                                  <span key={b.currency} className="block font-medium text-orange-800">
                                    {formatMoney(b.balanceMinor, b.currency)}
                                  </span>
                                ) : (
                                  <span key={b.currency} className="block font-medium text-emerald-800">
                                    Soldé ({b.currency})
                                  </span>
                                ),
                              )
                            )}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs font-medium text-slate-500">Ajouté</dt>
                        <dd className="mt-0.5 text-slate-700">
                          {formatDate(link.addedAt, tz)}
                          {addedBy ? ` par ${addedBy}` : ""}
                        </dd>
                      </div>
                    </dl>
                    {link.note && <p className="rounded-lg bg-surface px-3 py-2 text-sm whitespace-pre-line text-slate-700">{link.note}</p>}

                    <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="default" size="sm" className="min-h-10">
                          <Link href={clientUrl}>Fiche client</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="min-h-10">
                          <Link href={`${clientUrl}?tab=dossiers`}>
                            <FolderKanban aria-hidden />
                            Dossiers
                          </Link>
                        </Button>
                        {permissions.financeRead && (
                          <Button asChild variant="outline" size="sm" className="min-h-10">
                            <Link href={`${clientUrl}?tab=paiements`}>
                              <Wallet aria-hidden />
                              Finances
                            </Link>
                          </Button>
                        )}
                      </div>
                      {permissions.enroll && (
                        <ServiceClientActions
                          link={link}
                          who={`${fullName} du service « ${service.name} »`}
                          cases={clientCases.map((k) => ({ id: k.id, label: `${k.reference} — ${k.title}` }))}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
