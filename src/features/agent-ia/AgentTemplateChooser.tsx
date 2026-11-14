"use client";

import { useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { FileCheck, FolderOpen, GraduationCap, Headphones, Loader2, Plane, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { createAgentFromTemplateAction } from "./actions";
import { AGENT_TEMPLATES } from "./agent-templates";

// « Créer un agent IA » : un clic sur un modèle crée l'agent et ouvre le Studio.

const ICONS: Record<string, LucideIcon> = {
  support: Headphones,
  visas: FileCheck,
  studies: GraduationCap,
  travel: Plane,
  sales: TrendingUp,
  followup: FolderOpen,
};

export function AgentTemplateChooser({ onCreated, disabled = false }: { onCreated: (id: string) => void; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = (key: string) => {
    setChosen(key);
    setError(null);
    startTransition(async () => {
      const result = await createAgentFromTemplateAction(key);
      if (result.ok && result.id) onCreated(result.id);
      else setError(result.message);
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_TEMPLATES.map((template) => {
          const Icon = ICONS[template.key] ?? Headphones;
          const busy = pending && chosen === template.key;
          return (
            <button
              key={template.key}
              type="button"
              disabled={disabled || pending}
              onClick={() => create(template.key)}
              className={cn(
                "flex min-h-24 flex-col gap-2 rounded-xl p-4 text-left text-sm shadow-[0_1px_3px_rgba(2,55,100,0.1)] transition disabled:cursor-not-allowed disabled:opacity-60",
                template.recommended ? "bg-linear-to-br from-navy-800 to-navy-600 text-white hover:brightness-110" : "bg-white text-slate-800 hover:ring-2 hover:ring-navy-200",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={cn("flex size-9 items-center justify-center rounded-md", template.recommended ? "bg-citron-400 text-navy-900" : "bg-navy-800 text-citron-400")}>
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
                </span>
                {template.recommended && (
                  <span className="rounded-full border border-citron-500 bg-citron-400 px-2 py-0.5 text-xs font-semibold text-navy-900">Recommandé</span>
                )}
              </span>
              <span className={cn("font-semibold", template.recommended ? "text-white" : "text-navy-800")}>{template.title}</span>
              <span className={cn("text-xs", template.recommended ? "text-white/85" : "text-slate-600")}>{template.description}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
