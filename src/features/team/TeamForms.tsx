"use client";

import { useActionState, useState } from "react";
import { Copy, Crown, MessageCircle, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { initialFormState } from "@/lib/form-state";
import { inviteMemberAction, removeMemberAction, transferOwnershipAction, updateMemberRoleAction } from "./actions";
import { INVITABLE_ROLES } from "./invitations";

// L'application ne prétend pas envoyer l'invitation : elle crée un lien, que le responsable
// transmet lui-même (copie, ou message WhatsApp préparé qu'il envoie depuis son téléphone).
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" noValidate>
        <FormField id="invite-email" label="Adresse e-mail" required error={e.email} className="sm:col-span-2 lg:col-span-1">
          <Input id="invite-email" name="email" type="email" defaultValue={v.email} {...describedBy("invite-email", e.email)} />
        </FormField>
        <FormField id="invite-role" label="Rôle" required error={e.role}>
          <select id="invite-role" name="role" defaultValue={v.role ?? "agent"} className={selectClass}>
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE[role].label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="invite-job" label="Fonction">
          <Input id="invite-job" name="jobTitle" defaultValue={v.jobTitle} placeholder="Ex. : Conseillère études" />
        </FormField>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Création…" : "Créer l'invitation"}
        </Button>
      </form>
      {!state.ok && state.message && <FormMessage message={state.message} />}
      {state.ok && state.redirectTo && <InvitationLink link={state.redirectTo} />}
    </div>
  );
}

export function InvitationLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Bonjour, je vous invite à rejoindre notre agence sur SELECT Agency. Créez votre compte avec votre adresse e-mail en suivant ce lien : ${link}`;
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
      <p>Invitation créée. Transmettez ce lien à la personne invitée (valable 7 jours) :</p>
      <p className="break-all font-mono text-xs text-slate-800">{link}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          <Copy aria-hidden />
          {copied ? "Lien copié" : "Copier le lien"}
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            Préparer un message WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}

interface ManagedMember {
  id: string;
  fullName: string;
  role: MemberRole;
  hasAccount: boolean;
}

/**
 * Actions d'un responsable sur un membre : changer son rôle, le retirer de l'équipe (son travail en
 * cours est confié à quelqu'un d'autre), ou, pour le propriétaire, lui transmettre la propriété.
 */
export function MemberManage({ member, heirs, canTransfer }: { member: ManagedMember; heirs: { value: string; label: string }[]; canTransfer: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, initialFormState);
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, initialFormState);
  const [transferState, transferAction, transferPending] = useActionState(transferOwnershipAction, initialFormState);
  const id = member.id.slice(0, 8);
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-10 cursor-pointer items-center px-3 text-sm font-medium text-navy-800">Gérer l&apos;accès</summary>
      <div className="space-y-4 border-t border-slate-100 p-3">
        <form action={roleAction} className="space-y-2">
          <input type="hidden" name="memberId" value={member.id} />
          <FormField id={`role-${id}`} label="Rôle" required>
            <select id={`role-${id}`} name="role" defaultValue={member.role} className={selectClass}>
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE[role].label}
                </option>
              ))}
            </select>
          </FormField>
          <Button type="submit" size="sm" variant="outline" disabled={rolePending}>
            {rolePending ? "Enregistrement…" : "Changer le rôle"}
          </Button>
          <FormMessage message={roleState.message} tone={roleState.ok ? "success" : "error"} />
        </form>

        <form action={removeAction} className="space-y-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="memberId" value={member.id} />
          <FormField id={`heir-${id}`} label="Confier son travail en cours à" required hint="Clients, dossiers actifs, tâches ouvertes et rendez-vous à venir.">
            <select id={`heir-${id}`} name="heirId" defaultValue={heirs[0]?.value} className={selectClass} {...describedBy(`heir-${id}`, undefined, "hint")}>
              {heirs.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </FormField>
          <label className="flex min-h-10 items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="confirm" value="oui" className="mt-0.5 size-4 accent-navy-800" />
            Je confirme : {member.fullName} perd immédiatement l&apos;accès à l&apos;agence.
          </label>
          <Button type="submit" size="sm" variant="destructive" disabled={removePending}>
            <UserMinus aria-hidden />
            {removePending ? "Retrait…" : "Retirer de l'équipe"}
          </Button>
          <FormMessage message={removeState.message} tone={removeState.ok ? "success" : "error"} />
        </form>

        {canTransfer && member.hasAccount && (
          <form action={transferAction} className="space-y-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="memberId" value={member.id} />
            <p className="text-sm text-slate-600">
              Transmettre la propriété : {member.fullName} devient propriétaire (abonnement, fermeture de l&apos;agence) et vous devenez administrateur.
            </p>
            <label className="flex min-h-10 items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="confirm" value="oui" className="mt-0.5 size-4 accent-navy-800" />
              Je confirme le transfert de propriété.
            </label>
            <Button type="submit" size="sm" variant="outline" disabled={transferPending}>
              <Crown aria-hidden />
              {transferPending ? "Transfert…" : "Transmettre la propriété"}
            </Button>
            <FormMessage message={transferState.message} tone={transferState.ok ? "success" : "error"} />
          </form>
        )}
      </div>
    </details>
  );
}
