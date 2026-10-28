import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterForm } from "@/components/shared/FilterForm";
import { selectClass } from "@/components/shared/form";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { EmptyState, Notice, PageHeader } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { CLIENT_TYPE } from "@/lib/domain/labels";
import type { ClientType } from "@/lib/domain/types";
import { formatMoney, formatRelativeDay } from "@/lib/format";
import { listClients } from "@/features/clients/queries";
import { DeleteClientModal } from "@/features/clients/DeleteClientModal";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage({ searchParams }: PageProps<"/clients">) {
  return (
    <>
      <PageHeader
        title="Clients"
        description="Les personnes accompagnées par l'agence. Les données d'identité n'apparaissent jamais dans cette liste."
        actions={
          <Button asChild variant="accent">
            <Link href="/clients/new">
              <UserPlus aria-hidden />
              Nouveau client
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <ClientsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ClientsList({ searchParams }: Pick<PageProps<"/clients">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const type = typeof params.type === "string" && params.type in CLIENT_TYPE ? (params.type as ClientType) : undefined;
  const country = typeof params.pays === "string" ? params.pays : undefined;
  const { rows, agency, now, countries, total, canWrite, canDelete } = await listClients({ q, type, country });
  const tz = agency.timezone;

  return (
    <>
      {params.ok === "client-supprime" && (
        <div className="mb-4">
          <Notice tone="success" title="Client supprimé">
            La fiche client a été supprimée définitivement avec succès.
          </Notice>
        </div>
      )}

      <FilterForm action="/clients">
        <div className="flex-1 sm:min-w-64">
          <label htmlFor="q" className="mb-1 block text-sm font-medium text-slate-700">
            Rechercher
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Nom, référence, téléphone, e-mail" />
        </div>
        <div>
          <label htmlFor="type" className="mb-1 block text-sm font-medium text-slate-700">
            Type
          </label>
          <select id="type" name="type" defaultValue={type ?? ""} className={selectClass}>
            <option value="">Tous les types</option>
            {Object.entries(CLIENT_TYPE).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pays" className="mb-1 block text-sm font-medium text-slate-700">
            Pays de résidence
          </label>
          <select id="pays" name="pays" defaultValue={country ?? ""} className={selectClass}>
            <option value="">Tous les pays</option>
            {countries.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="default">
          <Search aria-hidden />
          Filtrer
        </Button>
      </FilterForm>

      <p className="mb-3 text-sm text-slate-600" aria-live="polite">
        {rows.length} client{rows.length > 1 ? "s" : ""} affiché{rows.length > 1 ? "s" : ""} sur {total}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={total === 0 ? "Aucun client pour le moment" : "Aucun client ne correspond à ces critères"}
          description={total === 0 ? "Enregistrez votre premier client pour ouvrir ensuite ses dossiers." : "Modifiez la recherche ou retirez un filtre."}
          action={
            total === 0 ? (
              <Button asChild variant="accent">
                <Link href="/clients/new">Nouveau client</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/clients">Effacer les filtres</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs font-semibold text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Client</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Résidence</th>
                  <th scope="col" className="px-4 py-3">Dossiers</th>
                  <th scope="col" className="px-4 py-3">Solde dû</th>
                  <th scope="col" className="px-4 py-3">Conseiller</th>
                  <th scope="col" className="px-4 py-3">Dernière activité</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ client, advisor, casesCount, activeCases, balanceMinor, lastActivityAt }) => (
                  <tr key={client.id} className="hover:bg-navy-50/50">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${client.id}`} className="font-medium text-navy-800 hover:underline">
                        {client.firstName} {client.lastName}
                      </Link>
                      <span className="block font-mono text-xs text-slate-500">{client.reference}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{CLIENT_TYPE[client.clientType]}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {client.city}, {countryName(client.residenceCountry)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {casesCount} <span className="text-slate-500">({activeCases} actif{activeCases > 1 ? "s" : ""})</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{balanceMinor ? formatMoney(balanceMinor, agency.currency) : "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{advisor?.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{formatRelativeDay(lastActivityAt, now, tz, false)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canWrite && (
                        <Link
                          href={`/clients/${client.id}/edit`}
                          className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-navy-50 hover:text-navy-800 transition"
                          title="Modifier ce client"
                          aria-label={`Modifier ${client.firstName} ${client.lastName}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Link>
                        )}
                        {canDelete && <DeleteClientModal client={client} variant="icon" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {rows.map(({ client, activeCases, balanceMinor }) => (
              <li key={client.id} className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.12)] border border-slate-100">
                <Link href={`/clients/${client.id}`} className="block">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-navy-800">
                      {client.firstName} {client.lastName}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{client.reference}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {CLIENT_TYPE[client.clientType]} · {client.city} · {activeCases} dossier{activeCases > 1 ? "s" : ""} actif{activeCases > 1 ? "s" : ""}
                  </span>
                  {balanceMinor > 0 && <span className="mt-1 block text-sm text-orange-800">Solde dû : {formatMoney(balanceMinor, agency.currency)}</span>}
                </Link>
                {(canWrite || canDelete) && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2 text-xs">
                  {canWrite && (
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                    <Link href={`/clients/${client.id}/edit`}>
                      <Pencil className="size-3.5" aria-hidden />
                      Modifier
                    </Link>
                  </Button>
                  )}
                  {canDelete && <DeleteClientModal client={client} />}
                </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
