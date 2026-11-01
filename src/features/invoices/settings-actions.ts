"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import type { InvoiceImageKind } from "@/lib/domain/types";
import { formValues, type FormState } from "@/lib/form-state";
import { BRANDING_BUCKET } from "./storage";

// Réglages des factures : coordonnées imprimées et images (logo, cachet, signature). Réservés au
// propriétaire et aux administrateurs ; la base le vérifie aussi (save_invoice_settings, set_invoice_image).

const settingsSchema = z.object({
  legalName: z.string().trim().max(160, "160 caractères au plus."),
  address: z.string().trim().max(250, "250 caractères au plus."),
  phone: z.string().trim().max(40, "40 caractères au plus."),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.").max(254)]),
  taxId: z.string().trim().max(160, "160 caractères au plus."),
  signatoryName: z.string().trim().max(120, "120 caractères au plus."),
  paymentDetails: z.string().trim().max(500, "500 caractères au plus."),
  footerNote: z.string().trim().max(500, "500 caractères au plus."),
});

export async function saveInvoiceSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = settingsSchema.safeParse({ ...values, email: (values.email ?? "").trim() });
  if (!parsed.success) {
    return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage"), values };
  const s = parsed.data;
  const { error } = await ctx.supabase.rpc("save_invoice_settings", {
    p_organization_id: ctx.organizationId,
    p_settings: {
      legal_name: s.legalName,
      address: s.address,
      phone: s.phone,
      email: s.email,
      tax_id: s.taxId,
      signatory_name: s.signatoryName,
      payment_details: s.paymentDetails,
      footer_note: s.footerNote,
    },
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Coordonnées des factures enregistrées." };
}

const kindSchema = z.enum(["logo", "stamp", "signature"]);
const DONE: Record<InvoiceImageKind, { saved: string; removed: string }> = {
  logo: { saved: "Logo enregistré : il apparaît sur les factures.", removed: "Logo retiré des factures." },
  stamp: { saved: "Cachet enregistré : il apparaît sur les factures.", removed: "Cachet retiré des factures." },
  signature: { saved: "Signature enregistrée : elle apparaît sur les factures.", removed: "Signature retirée des factures." },
};

/**
 * Remplace (path) ou retire (path vide) une image des factures. Le navigateur a déjà déposé le
 * fichier dans le stockage ; l'ancienne image est ensuite effacée.
 */
export async function setInvoiceImageAction(input: { kind: InvoiceImageKind; path: string }): Promise<{ ok: boolean; message: string }> {
  const kind = kindSchema.safeParse(input.kind);
  if (!kind.success) return { ok: false, message: "Image inconnue." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { ok: false, message: forbiddenMessage(ctx, "settings.manage") };
  const { data: previous, error } = await ctx.supabase.rpc("set_invoice_image", {
    p_organization_id: ctx.organizationId,
    p_kind: kind.data,
    p_path: input.path,
  });
  if (error) return { ok: false, message: dbMessage(error) };
  if (typeof previous === "string" && previous) await ctx.supabase.storage.from(BRANDING_BUCKET).remove([previous]);
  refresh();
  return { ok: true, message: input.path ? DONE[kind.data].saved : DONE[kind.data].removed };
}
