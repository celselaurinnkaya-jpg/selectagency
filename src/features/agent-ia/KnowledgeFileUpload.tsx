"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadKnowledgeFileAction } from "./knowledge-actions";

// Bouton « Envoyer un PDF ou un Word » : le fichier est lu par le serveur et ajouté aux connaissances de l'agent.

export function KnowledgeFileUpload({ agentId, disabled = false }: { agentId?: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const send = (file: File) => {
    if (!agentId) return;
    setResult(null);
    const fd = new FormData();
    fd.append("agentId", agentId);
    fd.append("file", file);
    startTransition(async () => {
      try {
        setResult(await uploadKnowledgeFileAction(fd));
      } catch {
        setResult({ ok: false, message: "Envoi impossible : le fichier dépasse peut-être 3,5 Mo." });
      }
      if (input.current) input.current.value = "";
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) send(file);
        }}
      />
      <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={disabled || pending || !agentId} onClick={() => input.current?.click()}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
        {pending ? "Lecture du document…" : "Envoyer un PDF ou un Word"}
      </Button>
      {result && (
        <span role={result.ok ? "status" : "alert"} className={result.ok ? "text-xs text-emerald-800" : "text-xs text-red-800"}>
          {result.message}
        </span>
      )}
    </span>
  );
}
