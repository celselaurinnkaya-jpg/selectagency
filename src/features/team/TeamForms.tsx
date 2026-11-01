"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, Crown, MessageCircle, RefreshCw, UserMinus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  inviteMemberAction,
  removeMemberAction,
  renewInvitationAction,
  revokeInvitationAction,
  transferOwnershipAction,
  updateMemberRoleAction,
} from "./actions";
import { INVITABLE_ROLES } from "./invitations";

type InvitableRole = (typeof INVITABLE_ROLES)[number];

// L'application ne prétend pas envoyer l'invitation : elle crée un lien, que le responsable
// transmet lui-même (copie, ou message WhatsApp préparé qu'il envoie depuis son téléphone).
// Champs contrôlés envoyés par onSubmit : React 19 vide un formulaire « action » après chaque
// réponse, même refusée, et le rôle choisi ne doit jamais revenir en silence à « Agent ».
export function InviteForm() {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("agent");
  const [jobTitle, setJobTitle] = useState("");
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("email", email);
    data.set("role", role);
    data.set("jobTitle", jobTitle);
    startTransition(async () => {
      const result = await inviteMemberAction(initialFormState, data);
      setState(result);
      if (result.ok) {
        setEmail("");
        setRole("agent");
        setJobTitle("");
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="invite-email" label="Adresse e-mail" required error={e.email} className="sm:col-span-2 lg:col-span-1">
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="prenom.nom@exemple.com"
              {...describedBy("invite-email", e.email)}
            />
          </FormField>
          <FormField id="invite-role" label="Rôle" required error={e.role} hint={ROLE[role].description}>
            <select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as InvitableRole)}
              className={selectClass}
              {...describedBy("invite-role", e.role, ROLE[role].description)}
            >
              {INVITABLE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE[option].label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="invite-job" label="Fonction">
            <Input id="invite-job" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={80} placeholder="Ex. : Conseillère études" />
          </FormField>
        </div>
        <Button type="submit" variant="accent" disabled={pending}>
          <UserPlus aria-hidden />
          {pending ? "Création…" : "Créer l'invitation"}
        </Button>
      </form>
      {!state.ok && state.message && <FormMessage message={state.message} />}
      {state.ok && state.redirectTo && <InvitationLink link={state.redirectTo} />}
    </div>
  );
}

export function InvitationLink({ link }: { link: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
      <p>Invitation créée. Transmettez ce lien à la personne invitée (valable 7 jours) :</p>
      <p className="break-all font-mono text-xs text-slate-800">{link}</p>
      <ShareInvitation link={link} />
    </div>
  );
}

/** Copier le lien, ou préparer le message WhatsApp que le responsable envoie lui-même. */
function ShareInvitation({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Bonjour, je vous invite à rejoindre notre agence sur SELECT Agency. Créez votre compte avec votre adresse e-mail en suivant ce lien : ${link}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        <Copy aria-hidden />
        {copied ? "Lien copié" : "Copier le lien"}
      </Button>
      <Button asChild variant="outline">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden />
          Préparer un message WhatsApp
        </a>
      </Button>
    </div>
  );
}

/** Invitation en attente : retransmettre son lien, la renouveler si elle a expiré, ou l'annuler. */
export function PendingInvitationActions({ id, link, expired, canRenew }: { id: string; link: string; expired: boolean; canRenew: boolean }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!expired && <ShareInvitation link={link} />}
        {expired && canRenew && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(async () => setState(await renewInvitationAction(id)))}
          >
            <RefreshCw aria-hidden />
            {pending ? "Renouvellement…" : "Renouveler l'invitation"}
          </Button>
        )}
        <form action={revokeInvitationAction}>
          <input type="hidden" name="invitationId" value={id} />
          <Button type="submit" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800">
            <X aria-hidden />
            Annuler l&apos;invitation
          </Button>
        </form>
      </div>
      {state.message && <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />}
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
          <Button type="submit" variant="outline" disabled={rolePending}>
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
          <Button type="submit" variant="destructive" disabled={removePending}>
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
            <Button type="submit" variant="outline" disabled={transferPending}>
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
