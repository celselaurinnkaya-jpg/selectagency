import type { CaseOutcome, CaseStep, StepTransitionOption } from "@/lib/domain/types";
import { CONFIRMATION } from "@/lib/domain/labels";

// Règles de transition des dossiers (plan §8.3), sous forme de fonctions pures :
// - une étape « organisme extérieur » ne se termine qu'avec un niveau de confirmation :
//   « déclaré » (source obligatoire) ou « confirmé » (référence du justificatif obligatoire) ;
// - revenir en arrière ou passer une étape facultative exige un motif ;
// - clôturer un dossier dont le solde n'est pas réglé exige une confirmation explicite.

export type TransitionMode = "advance" | "skip" | "back";

export interface TransitionInput {
  mode: TransitionMode;
  to?: string;
  confirmation?: "declared" | "confirmed";
  evidenceRef?: string;
  sourceNote?: string;
  reason?: string;
  acknowledgeBalance?: boolean;
}

export type ValidationResult = { ok: true } | { ok: false; error: string; field?: keyof TransitionInput };

export function currentStep(steps: CaseStep[]): CaseStep | undefined {
  return steps.find((step) => step.status === "in_progress");
}

function byPosition(steps: CaseStep[]): CaseStep[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

export function forwardOptions(steps: CaseStep[], current: CaseStep): StepTransitionOption[] {
  const keys = new Set(steps.map((s) => s.key));
  if (current.next?.length) return current.next.filter((option) => keys.has(option.to));
  if (current.kind === "closure") return [];
  const following = byPosition(steps).find((s) => s.position > current.position);
  return following ? [{ to: following.key, label: `Étape suivante : ${following.label}` }] : [];
}

export function backOptions(steps: CaseStep[], current: CaseStep): StepTransitionOption[] {
  return byPosition(steps)
    .filter(
      (s) =>
        s.position < current.position &&
        (s.status === "done" || s.status === "skipped") &&
        s.kind !== "outcome" &&
        s.kind !== "closure",
    )
    .map((s) => ({ to: s.key, label: `Revenir à « ${s.label} »` }));
}

export function requiresConfirmation(step: CaseStep): boolean {
  return step.kind === "external_event";
}

const hasText = (value: string | undefined, min = 3) => (value?.trim().length ?? 0) >= min;

export function validateTransition(
  steps: CaseStep[],
  input: TransitionInput,
  context: { balanceDueMinor: number },
): ValidationResult {
  const current = currentStep(steps);
  if (!current) return { ok: false, error: "Ce dossier n'a plus d'étape en cours." };

  if (input.mode === "advance") {
    const option = forwardOptions(steps, current).find((o) => o.to === input.to);
    if (!option) return { ok: false, error: "Choisissez l'étape suivante.", field: "to" };

    if (requiresConfirmation(current)) {
      if (!input.confirmation) {
        return { ok: false, error: "Indiquez si l'information est déclarée ou confirmée par un justificatif.", field: "confirmation" };
      }
      if (input.confirmation === "declared" && !hasText(input.sourceNote)) {
        return { ok: false, error: "Précisez la source de l'information (par exemple : appel du client le 12/11).", field: "sourceNote" };
      }
      if (input.confirmation === "confirmed" && !hasText(input.evidenceRef)) {
        return { ok: false, error: "Indiquez la référence du justificatif qui prouve cette information.", field: "evidenceRef" };
      }
    }

    const target = steps.find((s) => s.key === input.to);
    if (target?.kind === "closure" && context.balanceDueMinor > 0 && !input.acknowledgeBalance) {
      return { ok: false, error: "Le solde du dossier n'est pas réglé : confirmez la clôture malgré tout.", field: "acknowledgeBalance" };
    }
    return { ok: true };
  }

  if (input.mode === "skip") {
    if (!current.isOptional) return { ok: false, error: "Seule une étape facultative peut être passée." };
    if (!hasText(input.reason)) return { ok: false, error: "Indiquez pourquoi cette étape est passée.", field: "reason" };
    if (forwardOptions(steps, current).length === 0) return { ok: false, error: "Aucune étape ne suit celle-ci." };
    return { ok: true };
  }

  const option = backOptions(steps, current).find((o) => o.to === input.to);
  if (!option) return { ok: false, error: "Choisissez l'étape à reprendre.", field: "to" };
  if (!hasText(input.reason)) return { ok: false, error: "Indiquez le motif du retour en arrière.", field: "reason" };
  return { ok: true };
}

export interface TransitionResult {
  steps: CaseStep[];
  from: CaseStep;
  to: CaseStep;
  /** Issue enregistrée lorsque le dossier entre dans une étape de résultat. */
  outcome?: CaseOutcome;
  closes: boolean;
  description: string;
}

function resetStep(step: CaseStep): CaseStep {
  return {
    ...step,
    status: "pending",
    confirmationLevel: undefined,
    evidenceRef: undefined,
    sourceNote: undefined,
    note: undefined,
    completedAt: undefined,
    completedBy: undefined,
  };
}

/** Applique une transition déjà validée et renvoie la nouvelle liste d'étapes. */
export function applyTransition(
  steps: CaseStep[],
  input: TransitionInput,
  context: { actorId: string; at: string },
): TransitionResult {
  // Le contrôle du solde relève de l'appelant (validateTransition avec le solde réel).
  const current = currentStep(steps);
  if (!current || !validateTransition(steps, input, { balanceDueMinor: 0 }).ok) {
    throw new Error("Transition invalide : la validation doit précéder l'application.");
  }

  const targetKey = input.mode === "skip" ? forwardOptions(steps, current)[0]!.to : input.to!;
  const target = steps.find((s) => s.key === targetKey)!;
  const goesBackwards = target.position < current.position;

  const confirmation =
    input.mode === "advance" && requiresConfirmation(current)
      ? {
          confirmationLevel: input.confirmation,
          evidenceRef: input.confirmation === "confirmed" ? input.evidenceRef?.trim() : undefined,
          sourceNote: input.confirmation === "declared" ? input.sourceNote?.trim() : undefined,
        }
      : {};

  const next = steps.map((step): CaseStep => {
    if (step.id === current.id) {
      if (input.mode === "back") return resetStep(step);
      return {
        ...step,
        ...confirmation,
        status: input.mode === "skip" ? "skipped" : "done",
        note: input.mode === "skip" ? input.reason?.trim() : step.note,
        completedAt: context.at,
        completedBy: context.actorId,
      };
    }
    if (step.id === target.id) {
      const entered: CaseStep = { ...resetStep(step), status: target.kind === "closure" ? "done" : "in_progress" };
      if (target.kind === "closure") return { ...entered, completedAt: context.at, completedBy: context.actorId };
      // Une étape de résultat reprend le niveau de preuve de l'information qui l'a déclenchée.
      if (target.kind === "outcome") return { ...entered, ...confirmation, completedAt: context.at, completedBy: context.actorId };
      return entered;
    }
    if (goesBackwards && step.position > target.position && step.position < current.position) {
      // Nouvelle demande ou retour : on reprend les étapes intermédiaires, en gardant l'historique des résultats.
      return step.kind === "outcome" && step.status === "done" ? step : resetStep(step);
    }
    if (!goesBackwards && step.position > current.position && step.position < target.position && step.status === "pending") {
      return { ...step, status: "skipped", note: "Non concerné" };
    }
    return step;
  });

  return {
    steps: next,
    from: current,
    to: target,
    outcome: target.kind === "outcome" ? target.outcome : undefined,
    closes: target.kind === "closure",
    description: describeTransition(current, target, input),
  };
}

export function describeTransition(from: CaseStep, to: CaseStep, input: TransitionInput): string {
  if (input.mode === "back") return `Retour à l'étape « ${to.label} ». Motif : ${input.reason?.trim()}`;
  if (input.mode === "skip") return `Étape « ${from.label} » passée. Motif : ${input.reason?.trim()}`;
  let text = `Étape « ${from.label} » terminée`;
  if (input.confirmation) {
    text += ` (${CONFIRMATION[input.confirmation].label.toLowerCase()}`;
    text += input.confirmation === "confirmed" ? ` : ${input.evidenceRef?.trim()})` : ` ; source : ${input.sourceNote?.trim()})`;
  }
  return to.kind === "closure" ? `${text}. Dossier clôturé.` : `${text}. Étape en cours : « ${to.label} ».`;
}
