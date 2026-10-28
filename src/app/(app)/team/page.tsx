import { Suspense } from "react";
import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, PlannedAction, Section, StatusBadge } from "@/components/shared/ui";
import { ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { initials } from "@/lib/format";
import { getTeam } from "@/features/operations/queries";

export const metadata: Metadata = { title: "Équipe" };

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Équipe"
        description="Les membres de l'agence et leur rôle. Chaque rôle n'accède qu'aux informations nécessaires à son travail."
        actions={<PlannedAction icon={UserPlus} label="Inviter un collaborateur" reason="Invitations par e-mail avec la connexion sécurisée (Phase 6)." />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const { members, currentMemberId } = await getTeam();
  return (
    <div className="space-y-6">
      <Section title="Membres">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {members.map(({ member, activeCases, openTasks, overdueTasks }) => (
            <Card key={member.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy-800 font-semibold text-citron-400">{initials(member.fullName)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {member.fullName}
                    {member.id === currentMemberId && <span className="font-normal text-slate-500"> (vous)</span>}
                  </span>
                  <span className="block truncate text-sm text-slate-600">{member.jobTitle}</span>
                </span>
              </div>
              <StatusBadge spec={ROLE[member.role]} />
              <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Dossiers</dt>
                  <dd className="font-semibold tabular-nums">{activeCases}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Tâches</dt>
                  <dd className="font-semibold tabular-nums">{openTasks}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">En retard</dt>
                  <dd className={`font-semibold tabular-nums ${overdueTasks ? "text-red-700" : ""}`}>{overdueTasks}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Les rôles">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ROLE) as MemberRole[]).map((role) => (
            <li key={role}>
              <Card className="h-full">
                <p className="font-medium text-navy-800">{ROLE[role].label}</p>
                <p className="mt-1 text-sm text-slate-600">{ROLE[role].description}</p>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Dans cette démonstration, vous êtes connecté en tant que propriétaire. Les contrôles d&apos;accès par rôle seront appliqués par
          le serveur et la base de données avec l&apos;authentification (Phase 6).
        </p>
      </Section>
    </div>
  );
}
