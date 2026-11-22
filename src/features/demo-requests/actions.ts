"use server";

import { z } from "zod";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

// Formulaire « Demander une démonstration » du site public. La base vérifie à nouveau chaque champ et limite
// les répétitions (fonction request_demo) ; seule la console SELECT lit les demandes.

const demoSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez votre nom.").max(120),
  agencyName: z.string().trim().min(2, "Indiquez le nom de votre agence.").max(160),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "Choisissez votre pays."),
  phone: z.string().trim().min(6, "Indiquez un numéro de téléphone ou WhatsApp.").max(40),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]).optional(),
  message: z.string().trim().max(1000, "Message trop long (1 000 caractères au plus).").optional(),
});

export async function requestDemoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  // Champ invisible pour les personnes : seul un robot le remplit. On ne lui dit rien, on n'enregistre rien.
  if (values.website) return { ok: true, message: "Merci : votre demande est bien enregistrée." };

  const parsed = demoSchema.safeParse({ ...values, email: values.email?.trim().toLowerCase() });
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_demo", {
    p_full_name: parsed.data.fullName,
    p_agency_name: parsed.data.agencyName,
    p_country_code: parsed.data.countryCode,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email || null,
    p_message: parsed.data.message ?? "",
  });
  if (error) return { message: dbMessage(error), values };
  return {
    ok: true,
    message: "Merci : votre demande est bien enregistrée. L'équipe SELECT vous recontacte par téléphone ou WhatsApp pour fixer la démonstration.",
  };
}
