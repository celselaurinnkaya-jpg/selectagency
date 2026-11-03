import { describe, expect, it } from "vitest";
import { caseKindLabel, isStructuralStep, resolveTemplate, templatesForCategory, WORKFLOW_TEMPLATES } from "./templates";

describe("modèles d'étapes", () => {
  it.each(WORKFLOW_TEMPLATES.map((t) => [t.key, t] as const))("%s : clés uniques, choix valides, clôture en dernier", (_key, template) => {
    const keys = template.steps.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const step of template.steps) for (const option of step.next ?? []) expect(keys).toContain(option.to);
    expect(template.steps.at(-1)?.kind).toBe("closure");
  });

  it("sépare Campus France, Parcoursup et les écoles privées", () => {
    expect(templatesForCategory("study_abroad").map((t) => t.key)).toEqual(["campus_france", "parcoursup", "private_school", "study_abroad"]);
    expect(resolveTemplate("study_abroad", "parcoursup").key).toBe("parcoursup");
    // Une procédure d'un autre type de projet n'est jamais retenue : on revient au modèle du type.
    expect(resolveTemplate("tourist_visa", "parcoursup").key).toBe("tourist_visa");
    expect(resolveTemplate("study_abroad").key).toBe("study_abroad");
    expect(caseKindLabel("campus_france", "Études")).toBe("Études en France — Campus France");
    expect(caseKindLabel("study_abroad", "Études")).toBe("Études");
  });

  it("protège les étapes liées à une décision", () => {
    const steps = resolveTemplate("study_abroad", "private_school").steps;
    const structural = steps.filter((s) => isStructuralStep(s, steps)).map((s) => s.key);
    expect(structural).toEqual(expect.arrayContaining(["school_choice", "institution_response", "enrolment", "visa_prep", "visa_granted", "visa_refused", "departure_prep", "closed"]));
    expect(structural).not.toContain("documents");
  });
});
