import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Download, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, StatusBadge } from "@/components/shared/ui";
import { ROLE } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listUsers, type PlatformUser } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Utilisateurs" };

const FILTERS = [
  { key: "tous", label: "Tous" },
  { key: "sans-agence", label: "Sans agence" },
  { key: "non-confirmes", label: "E-mail non confirmé" },
  { key: "equipe-select", label: "Équipe SELECT" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const MATCHES: Record<FilterKey, (u: PlatformUser) => boolean> = {
  tous: () => true,
  "sans-agence": (u) => !u.organizationId,
  "non-confirmes": (u) => !u.emailConfirmedAt,
  "equipe-select": (u) => u.isPlatformAdmin,
};

export default function UsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Les comptes inscrits sur SELECT Agency, leur agence et leur dernière connexion."
        actions={
          <Button asChild variant="outline">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement d'un fichier CSV (route), pas une page */}
            <a href="/admin/export/utilisateurs" download>
              <Download aria-hidden />
              Exporter (CSV)
            </a>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <UserList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UserList({ searchParams }: Pick<PageProps<"/admin/utilisateurs">, "searchParams">) {
  const [{ filtre, q }, users] = await Promise.all([searchParams, listUsers()]);
  const filter: FilterKey = FILTERS.some((f) => f.key === filtre) ? (filtre as FilterKey) : "tous";
  const query = typeof q === "string" ? q.trim().toLowerCase() : "";
  // Recherche par e-mail ou par agence ; les plus récents d'abord.
  const searched = (query ? users.filter((u) => `${u.email} ${u.organizationName ?? ""}`.toLowerCase().includes(query)) : users).toSorted((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const rows = searched.filter(MATCHES[filter]);
  const href = (key: FilterKey) => {
    const search = new URLSearchParams();
    if (key !== "tous") search.set("filtre", key);
    if (query) search.set("q", query);
    const text = search.toString();
    return `/admin/utilisateurs${text ? `?${text}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <Form action="/admin/utilisateurs" className="flex gap-2">
        {filter !== "tous" && <input type="hidden" name="filtre" value={filter} />}
        <label htmlFor="utilisateurs-q" className="sr-only">
          Rechercher un compte
        </label>
        <Input id="utilisateurs-q" name="q" type="search" defaultValue={query} placeholder="E-mail ou agence" className="flex-1" />
        <Button type="submit">
          <Search aria-hidden />
          Rechercher
        </Button>
      </Form>
      <Pills
        label="Filtrer les comptes"
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: href(f.key), count: searched.filter(MATCHES[f.key]).length }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Aucun compte dans cette liste" />
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((u) => (
            <li key={u.userId}>
              <Card className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-slate-900">{u.email}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {u.isPlatformAdmin && <StatusBadge spec={{ label: "Équipe SELECT", tone: "navy" }} />}
                    {!u.emailConfirmedAt && <StatusBadge spec={{ label: "E-mail non confirmé", tone: "warning" }} />}
                    {u.role && <StatusBadge spec={ROLE[u.role]} />}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {u.organizationId ? (
                    <Link href={`/admin/agences/${u.organizationId}`} className="font-medium text-navy-700 hover:underline">
                      {u.organizationName}
                    </Link>
                  ) : (
                    "Sans agence"
                  )}
                  {` · inscrit le ${formatDate(u.createdAt, CONSOLE_TIMEZONE)}`}
                  {u.lastSignInAt ? ` · dernière connexion le ${formatDate(u.lastSignInAt, CONSOLE_TIMEZONE)}` : " · jamais connecté"}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Notice>
        Les comptes se gèrent ici en lecture : pour retirer l&apos;accès d&apos;une personne à une agence, son propriétaire le fait depuis la page
        Équipe ; pour bloquer ou supprimer un compte, utilisez le tableau de bord Supabase (Authentication &gt; Users).
      </Notice>
    </div>
  );
}
