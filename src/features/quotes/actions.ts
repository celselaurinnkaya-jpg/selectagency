"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { formValues, type FormState } from "@/lib/form-state";
import { parseAmount } from "@/features/finance/payments";

// Devis : préparés dans la devise du dossier ; à l'acceptation, la base crée les prestations
// convenues correspondantes (fonction set_quote_status).

const itemSchema = z.object({
  label: z.string().trim().min(2, "Décrivez chaque ligne.").max(160),
  chargeType: z.enum(["agency_fee", "third_party"]),
  quantity: z.coerce.number().int().min(1, "Quantité invalide.").max(999),
  unitAmount: z.string().trim().min(1, "Indiquez le prix de chaque ligne."),
});

const quoteSchema = z.object({
  caseId: z.uuid(),
  validUntil: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.string(),
});

export async function createQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = quoteSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", values };
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(parsed.data.items);
  } catch {
    return { message: "Les lignes du devis sont illisibles. Rechargez la page.", values };
  }
  const items = z.array(itemSchema).min(1, "Ajoutez au moins une ligne.").max(50, "Un devis compte au plus 50 lignes.").safeParse(rawItems);
  if (!items.success) return { message: items.error.issues[0]?.message ?? "Une ligne est incomplète.", values };

  const { data, ctx } = await readAgency({ cases: (q) => q.eq("id", parsed.data.caseId) });
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write"), values };
  const travelCase = data.cases[0];
  if (!travelCase) return { message: "Dossier introuvable.", values };
  const currency = travelCase.billingCurrency;
  const lines = [];
  for (const item of items.data) {
    const unit = parseAmount(item.unitAmount, currency);
    if (!unit) return { message: `Prix invalide en ${currency} pour « ${item.label} ».`, values };
    lines.push({ label: item.label, charge_type: item.chargeType, quantity: item.quantity, unit_amount_minor: unit });
  }
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unit_amount_minor, 0);

  const { data: created, error } = await ctx.supabase.rpc("create_quote", {
    p_case_id: travelCase.id,
    p_valid_until: parsed.data.validUntil || null,
    p_notes: parsed.data.notes ?? "",
    p_items: lines,
    p_event: `Devis {devis} préparé (${formatMoney(total, currency)}).`,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  const quote = created as { id: string; reference: string };
  return { ok: true, message: `Devis ${quote.reference} préparé.`, redirectTo: `/finance/quotes/${quote.id}` };
}

const statusSchema = z.object({
  quoteId: z.uuid(),
  status: z.enum(["sent", "accepted", "refused", "cancelled"]),
});

export async function setQuoteStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = statusSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: "Action inconnue." };
  const { ctx } = await readAgency({});
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  const label = QUOTE_STATUS[parsed.data.status].label.toLowerCase();
  const { error } = await ctx.supabase.rpc("set_quote_status", {
    p_quote_id: parsed.data.quoteId,
    p_status: parsed.data.status,
    p_event:
      parsed.data.status === "accepted"
        ? "Devis {devis} accepté : ses lignes sont ajoutées aux prestations du dossier."
        : `Devis {devis} : ${label}.`,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return {
    ok: true,
    message: parsed.data.status === "accepted" ? "Devis accepté : les prestations sont ajoutées au dossier." : `Devis ${label}.`,
  };
}
