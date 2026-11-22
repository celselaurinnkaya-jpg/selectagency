"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import type { FormState } from "@/lib/form-state";
import { parseAmount } from "./payments";

const closeCashSchema = z.object({
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  currency: z.string().length(3, "Devise invalide."),
  actualCashAmount: z.string().trim(),
  notes: z.string().trim().max(500, "Notes trop longues (500 caractères max).").optional(),
});

export async function closeDailyCashAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = closeCashSchema.safeParse({
    closingDate: formData.get("closingDate"),
    currency: formData.get("currency"),
    actualCashAmount: formData.get("actualCashAmount"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };

  const actualMinor = parseAmount(parsed.data.actualCashAmount, parsed.data.currency);
  if (actualMinor === null) {
    return {
      message: `Montant des espèces invalide en ${parsed.data.currency}.`,
      fieldErrors: { actualCashAmount: ["Montant invalide."] },
    };
  }

  const { error } = await ctx.supabase.rpc("close_daily_cash", {
    p_closing_date: parsed.data.closingDate,
    p_currency: parsed.data.currency,
    p_actual_cash_minor: actualMinor,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return { message: dbMessage(error) };

  refresh();
  return { ok: true, message: `Clôture de caisse du ${parsed.data.closingDate} enregistrée.` };
}
