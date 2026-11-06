import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { isStructuralStep, templateByKey, WORKFLOW_TEMPLATES, type TemplateStep, type WorkflowTemplate } from "./templates";

// Version des modèles adaptée par l'agence (table workflow_templates). Elle remplace les étapes du
// modèle de départ pour les dossiers ouverts ensuite ; nom, type de projet et description restent.

export async function loadTemplateOverrides(ctx: AgencyContext): Promise<Map<string, { steps: TemplateStep[]; updatedAt: string }>> {
  const { data, error } = await ctx.supabase.from("workflow_templates").select("template_key, steps, updated_at").eq("organization_id", ctx.organizationId);
  if (error) throw new Error(`Lecture impossible (workflow_templates) : ${error.message}`);
  return new Map((data ?? []).map((r) => [String(r.template_key), { steps: r.steps as TemplateStep[], updatedAt: String(r.updated_at) }]));
}

/** Le modèle tel que l'agence l'utilise : ses étapes à elle si elle les a adaptées. */
export async function effectiveTemplate(ctx: AgencyContext, template: WorkflowTemplate): Promise<WorkflowTemplate> {
  const override = (await loadTemplateOverrides(ctx)).get(template.key);
  return override ? { ...template, steps: override.steps } : template;
}

/** Page Paramètres > Modèles d'étapes : chaque modèle avec les étapes que l'agence utilise. */
export async function getWorkflowSettings() {
  const ctx = await getAgencyContext();
  const overrides = await loadTemplateOverrides(ctx);
  return {
    canManage: allowed(ctx, "settings.manage"),
    locked: ctx.locked.includes("custom_workflows"),
    templates: WORKFLOW_TEMPLATES.map((template) => {
      const override = overrides.get(template.key);
      return { template: override ? { ...template, steps: override.steps } : template, customized: !!override };
    }),
  };
}

/** Éditeur d'un modèle : étapes actuelles, et pour chacune si elle est liée à une décision (non retirable). */
export async function getWorkflowEditor(key: string) {
  const base = templateByKey(key);
  if (!base) return null;
  const ctx = await getAgencyContext();
  const override = (await loadTemplateOverrides(ctx)).get(key);
  const steps = override?.steps ?? base.steps;
  return {
    template: base,
    customized: !!override,
    version: override?.updatedAt ?? "depart",
    canManage: allowed(ctx, "settings.manage"),
    locked: ctx.locked.includes("custom_workflows"),
    steps: steps.map((s) => {
      const original = base.steps.find((o) => o.key === s.key);
      return { key: s.key, label: s.label, kind: s.kind, optional: !!s.optional, structural: !!original && isStructuralStep(original, base.steps) };
    }),
  };
}
