"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import type { FormState } from "@/lib/form-state";
import { isStructuralStep, templateByKey, type TemplateStep } from "./templates";

// Modèles d'étapes adaptés par l'agence. Les étapes liées à une décision (choix proposés, décisions,
// clôture) gardent leur clé et leurs choix : on peut les renommer, pas les retirer ni les changer de
// nature. Les autres se renomment, se déplacent, se retirent ; de nouvelles étapes s'ajoutent.

const stepInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(2, "Chaque étape compte 2 caractères au moins.").max(120, "Chaque étape compte 120 caractères au plus."),
  kind: z.enum(["agency_action", "client_action", "external_event", "outcome", "closure"]),
  optional: z.boolean().optional(),
});

export type TemplateStepInput = z.input<typeof stepInput>;

export async function saveWorkflowTemplateAction(templateKey: string, input: TemplateStepInput[]): Promise<FormState> {
  const base = templateByKey(templateKey);
  if (!base) return { message: "Modèle inconnu." };
  const parsed = z.array(stepInput).min(2, "Gardez au moins deux étapes.").max(60, "Soixante étapes au plus.").safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Étapes invalides." };

  const keys = new Set(parsed.data.map((s) => s.key));
  if (keys.size !== parsed.data.length) return { message: "Deux étapes portent la même clé." };
  // Les étapes liées à une décision restent, avec leur nature et leurs choix d'origine.
  const missing = base.steps.filter((s) => isStructuralStep(s, base.steps) && !keys.has(s.key));
  if (missing.length) return { message: `L'étape « ${missing[0]!.label} » est liée à une décision : renommez-la plutôt que de la retirer.` };

  const steps: TemplateStep[] = parsed.data.map((s) => {
    const original = base.steps.find((o) => o.key === s.key);
    if (original && isStructuralStep(original, base.steps)) {
      return { ...original, label: s.label };
    }
    // Étape ordinaire : ni décision ni clôture (ces natures ont des choix que l'agence ne définit pas ici).
    const kind = s.kind === "outcome" || s.kind === "closure" ? "agency_action" : s.kind;
    return { key: s.key, label: s.label, kind, ...(s.optional ? { optional: true } : {}) };
  });
  if (steps.at(-1)?.kind !== "closure") return { message: "La clôture du dossier reste la dernière étape." };

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage") };
  const { error } = await ctx.supabase.rpc("save_workflow_template", { p_organization_id: ctx.organizationId, p_template_key: base.key, p_steps: steps });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Modèle enregistré : les prochains dossiers suivront ces étapes. Les dossiers déjà ouverts gardent les leurs." };
}

export async function resetWorkflowTemplateAction(templateKey: string): Promise<FormState> {
  const base = templateByKey(templateKey);
  if (!base) return { message: "Modèle inconnu." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage") };
  const { error } = await ctx.supabase.rpc("reset_workflow_template", { p_organization_id: ctx.organizationId, p_template_key: base.key });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Modèle de départ rétabli pour les prochains dossiers." };
}
