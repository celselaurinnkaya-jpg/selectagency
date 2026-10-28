"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/demo/store";
import { formValues, type FormState } from "@/lib/form-state";
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/format";

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom de l'agence.").max(120),
  city: z.string().trim().min(1, "Indiquez la ville.").max(80),
  currency: z.enum(CURRENCY_OPTIONS.map((c) => c.code) as [string, ...string[]], { error: "Devise non prise en charge." }),
  timezone: z.enum(TIMEZONE_OPTIONS.map((t) => t.value) as [string, ...string[]], { error: "Fuseau horaire non pris en charge." }),
  receiptPrefix: z.string().trim().regex(/^[A-Z]{2,6}$/, "De 2 à 6 lettres majuscules, sans accent."),
});

export async function updateAgencyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) {
    return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const data = db();
  // La devise s'applique aux nouveaux dossiers : les dossiers existants gardent leur devise de facturation.
  data.agency = { ...data.agency, ...parsed.data };
  refresh();
  return { ok: true, message: "Paramètres enregistrés pour cette session de démonstration." };
}
