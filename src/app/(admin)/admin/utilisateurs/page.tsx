import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";
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
      <PageHeader title="Utilisateurs" description="Les comptes inscrits sur SELECT Agency, leur agence et leur dernière connexion." />
      <Suspense fallback={<PageSkeleton />}>
        <UserList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UserList({ searchParams }: Pick<PageProps<"/admin/utilisateurs">, "searchParams">) {
  const [{ filtre }, users] = await Promise.all([searchParams, listUsers()]);
  const filter: FilterKey = FILTERS.some((f) => f.key === filtre) ? (filtre as FilterKey) : "tous";
  const rows = users.filter(MATCHES[filter]);
  return (
    <div className="space-y-4">
      <Pills
        label="Filtrer les comptes"
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "tous" ? "/admin/utilisateurs" : `/admin/utilisateurs?filtre=${f.key}`, count: users.filter(MATCHES[f.key]).length }))}
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
