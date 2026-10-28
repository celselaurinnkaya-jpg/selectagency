"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { createClient } from "@/lib/supabase/browser";
import { registerUploadAction } from "./actions";
import { ACCEPTED_DOCUMENT_EXTENSIONS, ACCEPTED_DOCUMENT_TYPES, documentPath, DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from "./storage";

// Envoi d'une pièce : le navigateur dépose le fichier directement dans Storage (bucket privé,
// RLS par agence), puis le serveur le rattache à la pièce. Rien ne transite par l'application.
export function DocumentUpload({
  organizationId,
  caseId,
  requirementId,
  label,
}: {
  organizationId: string;
  caseId: string;
  requirementId: string;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  function send(file: File) {
    setMessage(null);
    if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
      setMessage({ text: "Format non accepté : envoyez un PDF ou une photo (JPEG, PNG, WebP).", tone: "error" });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setMessage({ text: "Fichier trop lourd : 10 Mo au maximum. Réduisez la photo ou scannez en PDF.", tone: "error" });
      return;
    }
    startTransition(async () => {
      const path = documentPath(organizationId, caseId, requirementId, file.name);
      const { error } = await createClient().storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setMessage({ text: "L'envoi a échoué. Vérifiez votre connexion internet, puis réessayez.", tone: "error" });
        return;
      }
      const result = await registerUploadAction({ requirementId, storagePath: path, fileName: file.name });
      setMessage({ text: result.message ?? "", tone: result.ok ? "success" : "error" });
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`fichier-${requirementId}`}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
        }}
      />
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()} aria-label={`Envoyer le fichier : ${label}`}>
        <Upload aria-hidden />
        {pending ? "Envoi en cours…" : "Envoyer le fichier"}
      </Button>
      <p className="text-xs text-slate-500">PDF ou photo, 10 Mo au maximum.</p>
      {message && <FormMessage message={message.text} tone={message.tone} />}
    </div>
  );
}
