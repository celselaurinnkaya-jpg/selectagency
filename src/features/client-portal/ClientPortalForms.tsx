"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, KeyRound, MessageCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/browser";
import { ACCEPTED_DOCUMENT_EXTENSIONS, ACCEPTED_DOCUMENT_TYPES, documentPath, DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from "@/features/documents/storage";
import {
  acceptClientPortalAccessAction,
  createClientPortalAccessAction,
  portalRegisterUploadAction,
  revokeClientPortalAccessAction,
} from "./actions";

/** Fiche client (agence) : ouvrir l'espace du client, retransmettre le lien, ou retirer l'accès. */
export function ClientPortalAccess({
  clientId,
  firstName,
  defaultEmail,
  hasAccess,
  pendingLink,
  pendingEmail,
}: {
  clientId: string;
  firstName: string;
  defaultEmail?: string;
  hasAccess: boolean;
  pendingLink?: string;
  pendingEmail?: string;
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(pendingEmail ?? defaultEmail ?? "");
  const [copied, setCopied] = useState(false);
  const link = state.ok && state.redirectTo ? state.redirectTo : pendingLink;
  const text = link
    ? `Bonjour ${firstName}, voici votre espace client : vous y suivez l'avancement de votre dossier et vous y déposez vos documents. Ouvrez ce lien et connectez-vous (ou créez votre compte) avec l'adresse ${email} : ${link}`
    : "";
  const fieldId = `portal-email-${clientId.slice(0, 8)}`;

  return (
    <div className="space-y-3">
      {hasAccess && (
        <p className="text-sm text-emerald-800">Le client a ouvert son espace : il y suit l&apos;avancement de ses dossiers et y dépose ses pièces.</p>
      )}
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => setState(await createClientPortalAccessAction(clientId, email)));
        }}
      >
        <FormField id={fieldId} label="Adresse e-mail du client" required className="min-w-60 flex-1">
          <Input id={fieldId} type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </FormField>
        <Button type="submit" variant={hasAccess ? "outline" : "accent"} disabled={pending}>
          <KeyRound aria-hidden />
          {pending ? "Création…" : hasAccess ? "Nouveau lien d'accès" : "Créer le lien de l'espace client"}
        </Button>
      </form>
      {link && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          <p>Lien à transmettre au client. Il se connecte (ou crée son compte) avec {email} :</p>
          <p className="break-all font-mono text-xs text-slate-800">{link}</p>
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
        </div>
      )}
      {(hasAccess || pendingLink) && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={() => startTransition(async () => setState(await revokeClientPortalAccessAction(clientId)))}
        >
          Retirer l&apos;accès
        </Button>
      )}
      <FormMessage message={state.redirectTo ? undefined : state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}

/** Le client, connecté avec la bonne adresse, ouvre son espace. */
export function AcceptClientPortalAccess({ token }: { token: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="space-y-2">
      <FormMessage message={state.message} />
      <Button
        type="button"
        variant="accent"
        disabled={pending || leaving}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptClientPortalAccessAction(token);
            if (result.ok && result.redirectTo) {
              setLeaving(true);
              window.location.assign(result.redirectTo);
            } else setState(result);
          })
        }
      >
        {pending || leaving ? "Un instant…" : "Ouvrir mon espace client"}
      </Button>
    </div>
  );
}

/** Espace client : dépôt d'un document attendu (directement dans le stockage privé, puis rattaché à la pièce). */
export function PortalDocumentUpload({ organizationId, caseId, requirementId, label }: { organizationId: string; caseId: string; requirementId: string; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  function send(file: File) {
    setMessage(null);
    if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type) || file.size > MAX_DOCUMENT_BYTES) {
      setMessage({ text: "Format non accepté ou fichier de plus de 10 Mo. Envoyez un PDF ou une photo (JPEG, PNG, WebP).", tone: "error" });
      return;
    }
    startTransition(async () => {
      const path = documentPath(organizationId, caseId, requirementId, file.name);
      const { error } = await createClient().storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setMessage({ text: "L'envoi a échoué. Vérifiez votre connexion internet, puis réessayez.", tone: "error" });
        return;
      }
      const result = await portalRegisterUploadAction({ requirementId, storagePath: path, fileName: file.name });
      setMessage({ text: result.message ?? (result.ok ? "Document reçu." : "L'envoi a échoué."), tone: result.ok ? "success" : "error" });
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`portal-file-${requirementId}`}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
        }}
      />
      <Button type="button" size="sm" variant="accent" disabled={pending} onClick={() => inputRef.current?.click()} aria-label={`Envoyer : ${label}`}>
        <Upload aria-hidden />
        {pending ? "Envoi…" : "Envoyer le document"}
      </Button>
      {message && <FormMessage message={message.text} tone={message.tone} />}
    </div>
  );
}
