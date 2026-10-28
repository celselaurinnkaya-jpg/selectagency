"use client";

import { useActionState, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { ROLE } from "@/lib/domain/labels";
import { initialFormState } from "@/lib/form-state";
import { inviteMemberAction } from "./actions";
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
