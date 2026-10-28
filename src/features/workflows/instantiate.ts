import type { CaseStep } from "@/lib/domain/types";
import type { WorkflowTemplate } from "./templates";

/**
 * Copie un modèle dans un dossier. Les étapes situées avant `currentKey` sont marquées terminées
 * (ou selon `overrides`), l'étape courante est en cours, les suivantes en attente.
 */
export function instantiateSteps(
  caseId: string,
  template: WorkflowTemplate,
  currentKey: string = template.steps[0]!.key,
  overrides: Record<string, Partial<CaseStep>> = {},
): CaseStep[] {
  const currentIndex = template.steps.findIndex((s) => s.key === currentKey);
  if (currentIndex < 0) throw new Error(`Étape inconnue « ${currentKey} » dans le modèle ${template.key}`);

  return template.steps.map((step, index): CaseStep => {
    const status: CaseStep["status"] =
      index < currentIndex ? "done" : index === currentIndex ? (step.kind === "closure" ? "done" : "in_progress") : "pending";
    return {
      id: `${caseId}-step-${step.key}`,
      caseId,
      position: index + 1,
      key: step.key,
      label: step.label,
      kind: step.kind,
      isOptional: step.optional ?? false,
      outcome: step.outcome,
      next: step.next,
      status,
      ...overrides[step.key],
    };
  });
}
