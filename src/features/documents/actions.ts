"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { can, FORBIDDEN_MESSAGE } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { DOCUMENTS_BUCKET } from "./storage";

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
  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE, values };

  const { data: requirement } = await ctx.supabase.from("document_requirements").select("label").eq("id", parsed.data.requirementId).maybeSingle();
  if (!requirement) return { message: "Pièce introuvable.", values };
  const { error } = await ctx.supabase.rpc("review_requirement", {
    p_requirement_id: parsed.data.requirementId,
    p_decision: parsed.data.decision,
    p_comment: parsed.data.comment ?? null,
    p_event:
      parsed.data.decision === "validated"
        ? `Pièce vérifiée par l'agence : ${requirement.label}.`
        : `Pièce à corriger : ${requirement.label} (${parsed.data.comment}).`,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: parsed.data.decision === "validated" ? "Pièce marquée comme vérifiée par l'agence." : "Pièce marquée « à corriger »." };
}

const uploadSchema = z.object({
  requirementId: z.uuid(),
  storagePath: z.string().min(10).max(400),
  fileName: z.string().trim().min(1).max(200),
});

/**
 * Le navigateur a déposé le fichier dans Storage (bucket privé) ; on le rattache à la pièce.
 * La base vérifie que le chemin appartient bien à ce dossier et que le fichier existe.
 */
export async function registerUploadAction(input: { requirementId: string; storagePath: string; fileName: string }): Promise<FormState> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { message: "Envoi incomplet : recommencez." };
  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE };

  const { data: requirement } = await ctx.supabase.from("document_requirements").select("label").eq("id", parsed.data.requirementId).maybeSingle();
  if (!requirement) return { message: "Pièce introuvable." };
  const { data: previousPath, error } = await ctx.supabase.rpc("register_requirement_file", {
    p_requirement_id: parsed.data.requirementId,
    p_storage_path: parsed.data.storagePath,
    p_file_name: parsed.data.fileName,
    p_event: `Document reçu : ${requirement.label} (${parsed.data.fileName}), à vérifier.`,
  });
  if (error) {
    // Fichier déposé mais non rattaché : on le retire pour ne pas laisser de document orphelin.
    await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove([parsed.data.storagePath]);
    return { message: dbMessage(error) };
  }
  // L'ancienne version (pièce à corriger, expirée) est remplacée : elle ne reste pas stockée.
  if (typeof previousPath === "string" && previousPath && previousPath !== parsed.data.storagePath) {
    await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove([previousPath]);
  }
  refresh();
  return { ok: true, message: "Fichier reçu : il est à vérifier par l'agence." };
}
