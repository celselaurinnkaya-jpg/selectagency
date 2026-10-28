import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { formatDate, initials } from "@/lib/format";
import { getTeam } from "@/features/operations/queries";
import { revokeInvitationAction } from "@/features/team/actions";
import { InviteForm } from "@/features/team/TeamForms";

export const metadata: Metadata = { title: "Équipe" };

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Équipe"
        description="Les membres de l'agence et leur rôle. Chaque rôle n'accède qu'aux informations nécessaires à son travail."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const { agency, members, currentMemberId, canManage, invitations } = await getTeam();
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

      {canManage && (
        <Section title="Inviter un collaborateur">
          <Card className="space-y-4">
            <p className="text-sm text-slate-600">
              La personne crée son compte avec cette adresse e-mail, puis rejoint l&apos;agence avec le rôle choisi. Le rôle de propriétaire ne
              s&apos;attribue pas par invitation.
            </p>
            <InviteForm />
          </Card>
          {invitations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{invitation.email}</span>
                      <span className="block text-xs text-slate-500">
                        {ROLE[invitation.role].label} · en attente · valable jusqu&apos;au {formatDate(invitation.expiresAt, agency.timezone)}
                      </span>
                    </span>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <button type="submit" className="inline-flex min-h-10 items-center text-sm font-medium text-red-700 hover:underline">
                        Annuler l&apos;invitation
                      </button>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

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
          Les droits de chaque rôle sont vérifiés par le serveur et par la base de données : masquer un bouton ne suffit jamais à donner ou retirer un accès.
        </p>
      </Section>
    </div>
  );
}
