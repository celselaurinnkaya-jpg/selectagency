"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/demo/store";
import { formValues, type FormState } from "@/lib/form-state";

// Vérification interne d'une pièce. « Vérifié par l'agence » n'est jamais une validation officielle.

const reviewSchema = z
  .object({
    requirementId: z.string().min(1),
    decision: z.enum(["validated", "to_correct"]),
    comment: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision !== "to_correct" || (v.comment?.length ?? 0) >= 5, {
    message: "Expliquez au client ce qu'il faut corriger.",
    path: ["comment"],
  });

export async function reviewDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { message: "Vérification incomplète.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const data = db();
  const requirement = data.requirements.find((r) => r.id === parsed.data.requirementId);
  if (!requirement) return { message: "Pièce introuvable.", values };
  if (requirement.status !== "received" && requirement.status !== "to_verify") {
    return { message: "Cette pièce n'est pas en attente de vérification.", values };
  }
  const travelCase = data.cases.find((c) => c.id === requirement.caseId);
  const now = new Date().toISOString();
  requirement.status = parsed.data.decision;
  requirement.reviewedAt = now;
  requirement.reviewedBy = data.currentMemberId;
  requirement.reviewComment = parsed.data.decision === "to_correct" ? parsed.data.comment : undefined;
  data.events.push({
    id: crypto.randomUUID(),
    at: now,
    actorId: data.currentMemberId,
    clientId: travelCase?.clientId,
    caseId: requirement.caseId,
    text:
      parsed.data.decision === "validated"
        ? `Pièce vérifiée par l'agence : ${requirement.label}.`
        : `Pièce à corriger : ${requirement.label} (${parsed.data.comment}).`,
  });
  refresh();
  return { ok: true, message: parsed.data.decision === "validated" ? "Pièce marquée comme vérifiée par l'agence." : "Pièce marquée « à corriger »." };
}
