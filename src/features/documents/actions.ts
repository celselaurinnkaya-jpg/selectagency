"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
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
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write"), values };

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
 * Le navigateur a déposé le fichier dans Storage (bucket privé) ; on l'ajoute aux fichiers de la
 * pièce (une pièce peut en compter plusieurs). La base vérifie que le chemin appartient bien à ce
 * dossier et que le fichier existe, puis remet la pièce « à vérifier ».
 */
export async function registerUploadAction(input: { requirementId: string; storagePath: string; fileName: string }): Promise<FormState> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { message: "Envoi incomplet : recommencez." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };

  const requirement = await requirementLabel(ctx, parsed.data.requirementId);
  if (!requirement) return { message: "Pièce introuvable." };
  const { error } = await ctx.supabase.rpc("add_requirement_file", {
    p_requirement_id: parsed.data.requirementId,
    p_storage_path: parsed.data.storagePath,
    p_file_name: parsed.data.fileName,
    p_event: `Document reçu : ${requirement} (${parsed.data.fileName}), à vérifier.`,
  });
  if (error) {
    // Fichier déposé mais non rattaché : on le retire pour ne pas laisser de document orphelin.
    await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove([parsed.data.storagePath]);
    return { message: dbMessage(error) };
  }
  refresh();
  return { ok: true, message: "Fichier reçu : la pièce est à vérifier par l'agence." };
}

async function requirementLabel(ctx: Awaited<ReturnType<typeof getAgencyContext>>, requirementId: string) {
  const { data } = await ctx.supabase
    .from("document_requirements")
    .select("label")
    .eq("id", requirementId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  return data ? String(data.label) : null;
}

/** Retire un fichier d'une pièce ; la base renvoie son emplacement, supprimé ensuite de Storage. */
export async function removeFileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ fileId: z.uuid(), requirementId: z.uuid(), fileName: z.string().max(200) }).safeParse(formValues(formData));
  if (!parsed.success) return { message: "Fichier introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const requirement = await requirementLabel(ctx, parsed.data.requirementId);
  if (!requirement) return { message: "Pièce introuvable." };

  const { data: path, error } = await ctx.supabase.rpc("remove_requirement_file", {
    p_file_id: parsed.data.fileId,
    p_event: `Fichier retiré de la pièce « ${requirement} » : ${parsed.data.fileName}.`,
  });
  if (error) return { message: dbMessage(error) };
  if (typeof path === "string" && path) await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  refresh();
  return { ok: true, message: "Fichier supprimé." };
}

const updateSchema = z.object({
  requirementId: z.uuid(),
  label: z.string().trim().min(2, "Indiquez le nom de la pièce.").max(160),
  isRequired: z.literal("1").optional(),
  expiresAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")]).optional(),
});

/** Modifie le nom, le caractère obligatoire et la date d'expiration d'une pièce. */
export async function updateRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = updateSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write"), values };
  const before = await requirementLabel(ctx, parsed.data.requirementId);
  if (!before) return { message: "Pièce introuvable.", values };

  const { error } = await ctx.supabase.rpc("update_requirement", {
    p_requirement_id: parsed.data.requirementId,
    p_label: parsed.data.label,
    p_is_required: parsed.data.isRequired === "1",
    p_expires_at: parsed.data.expiresAt || null,
    p_event: before === parsed.data.label ? `Pièce modifiée : ${parsed.data.label}.` : `Pièce modifiée : ${before} → ${parsed.data.label}.`,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Pièce mise à jour." };
}

/** Retire une pièce de la liste du dossier, avec tous ses fichiers. */
export async function deleteRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ requirementId: z.uuid(), confirm: z.literal("oui", { error: "Cochez la case pour confirmer." }) })
    .safeParse(formValues(formData));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Confirmation manquante." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const requirement = await requirementLabel(ctx, parsed.data.requirementId);
  if (!requirement) return { message: "Pièce introuvable." };

  const { data: paths, error } = await ctx.supabase.rpc("delete_requirement", {
    p_requirement_id: parsed.data.requirementId,
    p_event: `Pièce retirée de la liste du dossier : ${requirement}.`,
  });
  if (error) return { message: dbMessage(error) };
  if (Array.isArray(paths) && paths.length) await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove(paths as string[]);
  refresh();
  return { ok: true, message: `« ${requirement} » retirée de la liste.` };
}
