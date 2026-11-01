import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { INVITATION_EXPIRED, INVITATION_WAITING, ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { formatDate, initials } from "@/lib/format";
import { getTeam } from "@/features/operations/queries";
import { InviteForm, MemberManage, PendingInvitationActions } from "@/features/team/TeamForms";

export const metadata: Metadata = { title: "Équipe" };

const INVITE_STEPS = [
  "Indiquez son adresse e-mail et son rôle, puis créez l'invitation.",
  "Envoyez-lui le lien, par WhatsApp ou en le copiant.",
  "La personne crée son compte avec cette adresse et apparaît dans « Membres ».",
];

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

const ADD_ANCHOR = "ajouter-un-membre";

async function Team() {
  const { agency, members, removed, heirs, currentMemberId, canManage, canInvite, canTransfer, memberLimit, seatsUsed, seatsLeft, invitations } =
    await getTeam();
  // Ajouter un membre : responsables seulement, abonnement actif, et une place libre dans la formule.
  const full = seatsLeft === 0;
  const canAdd = canInvite && !full;
  return (
    <div className="space-y-6">
      <Section
        title="Membres"
        action={
          (memberLimit || canAdd) && (
            <div className="flex flex-wrap items-center gap-3">
              {memberLimit && (
                <span className="text-sm text-slate-600 tabular-nums">
                  {seatsUsed} sur {memberLimit} places utilisées
                </span>
              )}
              {canAdd && (
                <Button asChild variant="accent">
                  <a href={`#${ADD_ANCHOR}`}>
                    <UserPlus aria-hidden />
                    Ajouter un membre
                  </a>
                </Button>
              )}
            </div>
          )
        }
      >
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
              {canManage && member.id !== currentMemberId && member.role !== "owner" && (
                <MemberManage
                  member={{ id: member.id, fullName: member.fullName, role: member.role, hasAccount: member.hasAccount !== false }}
                  heirs={heirs.filter((h) => h.id !== member.id).map((h) => ({ value: h.id, label: `${h.fullName} (${ROLE[h.role].label})` }))}
                  canTransfer={canTransfer}
                />
              )}
            </Card>
          ))}
          {canAdd && (
            <a
              href={`#${ADD_ANCHOR}`}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center transition hover:ring-2 hover:ring-navy-200"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-navy-800 text-citron-400">
                <UserPlus aria-hidden className="size-5" />
              </span>
              <span className="font-medium text-navy-800">Ajouter un membre</span>
              <span className="text-sm text-slate-600">Agent, comptable, administrateur… chacun avec son propre accès.</span>
            </a>
          )}
        </div>
        {canAdd && members.length === 1 && (
          <p className="mt-3 text-sm text-slate-600">
            Vous êtes seul dans l&apos;agence pour l&apos;instant. Invitez vos collaborateurs : chacun aura son compte et ne verra que ce que son rôle permet.
          </p>
        )}
      </Section>

      {canManage && (
        <Section id={ADD_ANCHOR} title="Ajouter un membre" className="scroll-mt-24">
          {!canInvite ? (
            <Notice tone="warning" title="Invitations suspendues">
              L&apos;agence est en lecture seule : son abonnement est suspendu ou son essai est terminé. Vous pouvez toujours retirer l&apos;accès
              d&apos;un membre.
            </Notice>
          ) : full ? (
            <Notice tone="warning" title="Toutes les places sont utilisées">
              Votre formule permet {memberLimit} membres, invitations en attente comprises. Annulez une invitation en attente, retirez un ancien
              membre, ou demandez une formule plus grande depuis{" "}
              <Link href="/support" className="font-medium underline">
                Aide et support
              </Link>
              .
            </Notice>
          ) : (
            <Card className="space-y-5">
              <ol className="grid gap-3 sm:grid-cols-3">
                {INVITE_STEPS.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-citron-400 tabular-nums">
                      {index + 1}
                    </span>
                    <span className="text-sm text-slate-700">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="border-t border-slate-100 pt-4">
                <InviteForm />
              </div>
              <p className="text-xs text-slate-500">
                Le rôle de propriétaire ne s&apos;attribue pas par invitation : il se transmet depuis « Gérer l&apos;accès » sur la carte d&apos;un
                membre.
              </p>
            </Card>
          )}
        </Section>
      )}

      {canManage && invitations.length > 0 && (
        <Section title="Invitations en attente">
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{invitation.email}</span>
                      <span className="block text-sm text-slate-600">
                        {ROLE[invitation.role].label}
                        {invitation.jobTitle && ` · ${invitation.jobTitle}`}
                      </span>
                      <span className="block text-xs text-slate-500">
                        Créée le {formatDate(invitation.createdAt, agency.timezone)} ·{" "}
                        {invitation.expired ? "expirée le " : "valable jusqu'au "}
                        {formatDate(invitation.expiresAt, agency.timezone)}
                      </span>
                    </span>
                    <StatusBadge spec={invitation.expired ? INVITATION_EXPIRED : INVITATION_WAITING} />
                  </div>
                  <PendingInvitationActions id={invitation.id} link={invitation.link} expired={invitation.expired} canRenew={canInvite} />
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            La personne apparaît dans « Membres » dès qu&apos;elle a créé son compte avec l&apos;adresse invitée.
          </p>
        </Section>
      )}

      {removed.length > 0 && (
        <Section title="Anciens membres">
          <ul className="space-y-2">
            {removed.map((member) => (
              <li key={member.id}>
                <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700">{member.fullName}</span>
                    <span className="block truncate text-xs text-slate-500">{member.email}</span>
                  </span>
                  <span className="text-xs text-slate-500">Sans accès depuis le {formatDate(member.removedAt!, agency.timezone)}</span>
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600">Leur nom reste dans l&apos;historique des dossiers et sur les reçus qu&apos;ils ont établis.</p>
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
