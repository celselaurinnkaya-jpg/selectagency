"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { createClient } from "@/lib/supabase/browser";
import { registerUploadAction } from "./actions";
import { ACCEPTED_DOCUMENT_EXTENSIONS, ACCEPTED_DOCUMENT_TYPES, documentPath, DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from "./storage";

// Envoi des fichiers d'une pièce (un ou plusieurs à la fois : recto-verso, plusieurs relevés…) :
// le navigateur dépose chaque fichier directement dans Storage (bucket privé, RLS par agence),
// puis le serveur l'ajoute à la pièce. Rien ne transite par l'application.
export function DocumentUpload({
  organizationId,
  caseId,
  requirementId,
  label,
  hasFiles = false,
}: {
  organizationId: string;
  caseId: string;
  requirementId: string;
  label: string;
  hasFiles?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  function send(files: File[]) {
    setMessage(null);
    const refused = files.filter((f) => !(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(f.type) || f.size > MAX_DOCUMENT_BYTES);
    if (refused.length) {
      setMessage({
        text: `${refused.map((f) => f.name).join(", ")} : format non accepté ou fichier de plus de 10 Mo. Envoyez des PDF ou des photos (JPEG, PNG, WebP).`,
        tone: "error",
      });
      return;
    }
    startTransition(async () => {
      let sent = 0;
      for (const file of files) {
        const path = documentPath(organizationId, caseId, requirementId, file.name);
        const { error } = await createClient().storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          setMessage({ text: `L'envoi de « ${file.name} » a échoué. Vérifiez votre connexion internet, puis réessayez.`, tone: "error" });
          break;
        }
        const result = await registerUploadAction({ requirementId, storagePath: path, fileName: file.name });
        if (!result.ok) {
          setMessage({ text: result.message ?? "L'envoi a échoué.", tone: "error" });
          break;
        }
        sent += 1;
      }
      if (sent === files.length) {
        setMessage({ text: sent > 1 ? `${sent} fichiers reçus : la pièce est à vérifier par l'agence.` : "Fichier reçu : la pièce est à vérifier par l'agence.", tone: "success" });
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`fichier-${requirementId}`}
        type="file"
        multiple
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) send(files);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        aria-label={`${hasFiles ? "Ajouter un fichier" : "Envoyer le fichier"} : ${label}`}
      >
        <Upload aria-hidden />
        {pending ? "Envoi en cours…" : hasFiles ? "Ajouter un fichier" : "Envoyer le fichier"}
      </Button>
      <p className="text-xs text-slate-500">
        PDF ou photo, 10 Mo au maximum par fichier. Vous pouvez en choisir plusieurs (recto-verso, plusieurs pages).
        {hasFiles && " Un fichier ajouté remet la pièce « à vérifier »."}
      </p>
      {message && <FormMessage message={message.text} tone={message.tone} />}
    </div>
  );
}
