import { describe, expect, it } from "vitest";
import { instantiateSteps } from "./instantiate";
import { applyTransition, backOptions, currentStep, forwardOptions, validateTransition } from "./rules";
import { templateByKey } from "./templates";

const study = templateByKey("study_abroad")!;
const ctx = { actorId: "m1", at: "2026-10-27T10:00:00.000Z" };

describe("transitions d'étapes", () => {
  it("termine librement une étape de l'agence et passe à la suivante", () => {
    const steps = instantiateSteps("c1", study);
    const input = { mode: "advance" as const, to: "registration" };
    expect(validateTransition(steps, input, { balanceDueMinor: 0 })).toEqual({ ok: true });
    const result = applyTransition(steps, input, ctx);
    expect(currentStep(result.steps)?.key).toBe("registration");
    expect(result.steps.find((s) => s.key === "new_candidate")?.status).toBe("done");
  });

  it("exige un niveau de preuve pour une étape d'organisme extérieur", () => {
    const steps = instantiateSteps("c1", study, "visa_submission");
    const base = { mode: "advance" as const, to: "visa_decision_wait" };
    expect(validateTransition(steps, base, { balanceDueMinor: 0 })).toMatchObject({ ok: false, field: "confirmation" });
    expect(validateTransition(steps, { ...base, confirmation: "confirmed" }, { balanceDueMinor: 0 })).toMatchObject({ ok: false, field: "evidenceRef" });
    expect(validateTransition(steps, { ...base, confirmation: "declared" }, { balanceDueMinor: 0 })).toMatchObject({ ok: false, field: "sourceNote" });
    expect(validateTransition(steps, { ...base, confirmation: "declared", sourceNote: "Appel du client" }, { balanceDueMinor: 0 })).toEqual({ ok: true });
  });

  it("enregistre l'issue avec son niveau de preuve et écarte l'issue non concernée", () => {
    const steps = instantiateSteps("c1", study, "visa_decision_wait");
    const result = applyTransition(steps, { mode: "advance", to: "visa_refused", confirmation: "confirmed", evidenceRef: "Lettre de refus" }, ctx);
    expect(result.outcome).toBe("refused");
    const refused = result.steps.find((s) => s.key === "visa_refused")!;
    expect(refused).toMatchObject({ status: "in_progress", confirmationLevel: "confirmed", evidenceRef: "Lettre de refus" });
    expect(result.steps.find((s) => s.key === "visa_granted")?.status).toBe("skipped");
  });

  it("ne propose que les suites prévues après une décision", () => {
    const steps = instantiateSteps("c1", study, "visa_decision_wait");
    expect(forwardOptions(steps, currentStep(steps)!).map((o) => o.to)).toEqual(["visa_granted", "visa_refused"]);
  });

  it("permet une nouvelle demande après un refus en reprenant les étapes intermédiaires", () => {
    const refused = applyTransition(instantiateSteps("c1", study, "visa_decision_wait"), { mode: "advance", to: "visa_refused", confirmation: "declared", sourceNote: "Appel" }, ctx).steps;
    const retry = applyTransition(refused, { mode: "advance", to: "visa_prep" }, ctx);
    expect(currentStep(retry.steps)?.key).toBe("visa_prep");
    expect(retry.steps.find((s) => s.key === "visa_submission")?.status).toBe("pending");
    expect(retry.steps.find((s) => s.key === "visa_refused")?.status).toBe("done");
  });

  it("exige un motif pour revenir en arrière ou passer une étape facultative", () => {
    const steps = instantiateSteps("c1", study, "study_procedure");
    const current = currentStep(steps)!;
    expect(backOptions(steps, current).length).toBeGreaterThan(0);
    expect(validateTransition(steps, { mode: "back", to: "documents" }, { balanceDueMinor: 0 })).toMatchObject({ ok: false, field: "reason" });
    expect(validateTransition(steps, { mode: "skip" }, { balanceDueMinor: 0 })).toMatchObject({ ok: false, field: "reason" });
    const skipped = applyTransition(steps, { mode: "skip", reason: "Non requis pour ce pays" }, ctx);
    expect(skipped.steps.find((s) => s.key === "study_procedure")?.status).toBe("skipped");
    expect(currentStep(skipped.steps)?.key).toBe("interview_prep");
  });

  it("refuse de passer une étape obligatoire", () => {
    const steps = instantiateSteps("c1", study, "documents");
    expect(validateTransition(steps, { mode: "skip", reason: "Pour aller plus vite" }, { balanceDueMinor: 0 }).ok).toBe(false);
  });

  it("demande une confirmation pour clôturer un dossier non soldé", () => {
    const steps = instantiateSteps("c1", study, "departure_prep");
    const input = { mode: "advance" as const, to: "closed" };
    expect(validateTransition(steps, input, { balanceDueMinor: 5000 })).toMatchObject({ ok: false, field: "acknowledgeBalance" });
    expect(validateTransition(steps, { ...input, acknowledgeBalance: true }, { balanceDueMinor: 5000 })).toEqual({ ok: true });
    expect(applyTransition(steps, input, ctx).closes).toBe(true);
  });
});
