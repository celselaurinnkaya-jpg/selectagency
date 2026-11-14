"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";

const templateSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Le nom doit comporter au moins 2 caractères.").max(120),
  language: z.string().trim().default("fr"),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).default("UTILITY"),
  bodyText: z.string().trim().min(5, "Le contenu du message est requis.").max(1024),
});

export async function saveTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = templateSchema.safeParse(values);

  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const input = parsed.data;
  const ctx = await getAgencyContext();

  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { message: "Action réservée aux administrateurs.", values };
  }

  if (ctx.locked.includes("ai_agent")) {
    return { message: "Option réservée aux formules PRO et BUSINESS.", values };
  }

  const { data: templateId, error } = await ctx.supabase.rpc("save_wa_template", {
    p_id: input.id ? input.id : null,
    p_org: ctx.organizationId,
    p_name: input.name,
    p_language: input.language,
    p_category: input.category,
    p_body_text: input.bodyText,
  });

  if (error) {
    return { message: dbMessage(error), values };
  }

  if (!templateId) {
    return { message: "Échec d'enregistrement du modèle.", values };
  }

  refresh();
  return { ok: true, message: "Modèle WhatsApp enregistré avec succès." };
}

export async function deleteTemplateAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "Identifiant manquant." };
  }

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  const { error } = await ctx.supabase.rpc("delete_wa_template", {
    p_id: id,
    p_org: ctx.organizationId,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  refresh();
  return { ok: true, message: "Modèle supprimé." };
}

