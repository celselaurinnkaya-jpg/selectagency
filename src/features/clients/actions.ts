"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { can, FORBIDDEN_MESSAGE } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { clientToRow } from "@/lib/data/rows";
import { formValues, type FormState } from "@/lib/form-state";
import type { Client } from "@/lib/domain/types";
import { findDuplicates } from "./duplicates";

// Validation côté serveur : une Server Action est un point d'accès public, on ne fait jamais
// confiance aux contrôles du navigateur. La session et le rôle sont revérifiés ici, puis par la RLS.

const clientSchema = z.object({
  clientId: z.string().optional(),
  firstName: z.string().trim().min(1, "Indiquez le prénom.").max(80),
  lastName: z.string().trim().min(1, "Indiquez le nom.").max(80),
  clientType: z.enum(["individual", "student", "professional", "company"], { error: "Choisissez un type de client." }),
  gender: z.string().max(20).optional(),
  birthDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")]).optional(),
  nationality: z.string().trim().max(80).optional(),
  maritalStatus: z.string().max(30).optional(),
  idDocType: z.string().max(30).optional(),
  idDocNumber: z.string().trim().max(50).optional(),
  serviceMotive: z.string().max(40).optional(),

  residenceCountry: z.string().trim().min(1, "Choisissez ou indiquez le pays de résidence.").max(80),
  city: z.string().trim().min(1, "Indiquez la ville.").max(80),
  address: z.string().trim().max(250).optional(),
  phone: z.string().trim().min(6, "Indiquez le numéro de téléphone."),
  whatsapp: z.string().trim().optional(),
  email: z.union([z.literal(""), z.string().trim().email("Adresse e-mail invalide.")]).optional(),
  preferredLanguage: z.string().min(1, "Choisissez la langue de communication.").max(10),

  // Responsables
  isSelfResponsible: z.string().optional(),
  guardian1Name: z.string().trim().max(100).optional(),
  guardian1Phone: z.string().trim().max(40).optional(),
  guardian1Whatsapp: z.string().trim().max(40).optional(),
  guardian2Name: z.string().trim().max(100).optional(),
  guardian2Phone: z.string().trim().max(40).optional(),
  guardian2Whatsapp: z.string().trim().max(40).optional(),

  // Suivi par l'agence
  assignedTo: z.string().min(1, "Choisissez le conseiller."),
  notes: z.string().trim().max(2000).optional(),
  confirmDuplicate: z.literal("1").optional(),
});

/** Numéro au format international (+237…). Sans validation possible, on garde les seuls chiffres. */
function toE164(raw: string | undefined, country: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (country && country.length === 2) {
    const parsed = parsePhoneNumberFromString(trimmed, country as CountryCode);
    if (parsed?.isValid()) return parsed.number;
  }
  const parsedDirect = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
  if (parsedDirect?.isValid()) return parsedDirect.number;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
}

export async function saveClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const rawResidence = formData.get("residenceCountry")?.toString().trim();
  const customResidence = formData.get("customResidenceCountry")?.toString().trim();
  const residenceCountry = (rawResidence === "__OTHER__" || rawResidence === "other")
    ? (customResidence || "")
    : (rawResidence || "");

  const rawNationality = formData.get("nationality")?.toString().trim();
  const customNationality = formData.get("customNationality")?.toString().trim();
  const nationality = (rawNationality === "__OTHER__" || rawNationality === "other")
    ? (customNationality || "")
    : (rawNationality || "");

  const values = formValues(formData);
  values.residenceCountry = residenceCountry;
  values.nationality = nationality;
  const clientId = formData.get("clientId")?.toString().trim() || undefined;

  const parsed = clientSchema.safeParse(values);
  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }
  const input = parsed.data;
  const phoneE164 = toE164(input.phone, input.residenceCountry);
  if (!phoneE164) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: {
        phone: ["Numéro invalide pour le pays choisi. Exemple : +237 6 99 00 00 00."],
      },
      values,
    };
  }
  const whatsappE164 = input.whatsapp ? toE164(input.whatsapp, input.residenceCountry) : undefined;
  if (input.whatsapp && !whatsappE164) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: { whatsapp: ["Numéro WhatsApp invalide."] },
      values,
    };
  }

  const { data, ctx } = await readAgency({ clients: true });
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE, values };
  if (!data.members.some((m) => m.id === input.assignedTo)) {
    return { message: "Le conseiller choisi n'existe pas.", values };
  }

  const isSelf =
    input.isSelfResponsible === "1" ||
    input.isSelfResponsible === "true" ||
    input.isSelfResponsible === "on";

  let guardian1 = undefined;
  let guardian2 = undefined;

  if (!isSelf) {
    if (input.guardian1Name || input.guardian1Phone) {
      guardian1 = {
        name: input.guardian1Name || "",
        phone: input.guardian1Phone || "",
        whatsapp: input.guardian1Whatsapp || undefined,
      };
    }
    if (input.guardian2Name || input.guardian2Phone) {
      guardian2 = {
        name: input.guardian2Name || "",
        phone: input.guardian2Phone || "",
        whatsapp: input.guardian2Whatsapp || undefined,
      };
    }
  }

  const existing = clientId ? data.clients.find((c) => c.id === clientId) : undefined;
  if (clientId && !existing) {
    return { message: "Ce client n'existe pas ou a été supprimé.", values };
  }

  const fields: Parameters<typeof clientToRow>[0] = {
    clientType: input.clientType,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email || undefined,
    phoneE164,
    whatsappE164: whatsappE164 ?? undefined,
    residenceCountry: input.residenceCountry,
    city: input.city,
    preferredLanguage: input.preferredLanguage,
    assignedTo: input.assignedTo,
    notes: input.notes || undefined,
    gender: input.gender || undefined,
    birthDate: input.birthDate || undefined,
    nationality: input.nationality || undefined,
    maritalStatus: input.maritalStatus || undefined,
    idDocType: input.idDocType || undefined,
    passportLast4: input.idDocNumber === undefined ? existing?.passportLast4 : input.idDocNumber ? input.idDocNumber.slice(-4) : undefined,
    address: input.address || undefined,
    serviceMotive: input.serviceMotive || undefined,
    isSelfResponsible: isSelf,
    guardian1,
    guardian2,
  };

  const supabase = ctx.supabase;
  let saved: Pick<Client, "id" | "reference">;

  if (existing) {
    // Mode Modification
    const { data: rows, error } = await supabase.from("clients").update(clientToRow(fields)).eq("id", existing.id).select("id, reference");
    if (error) return { message: dbMessage(error), values };
    if (!rows?.length) return { message: "Ce client n'existe pas ou vous n'avez pas le droit de le modifier.", values };
    saved = { id: existing.id, reference: existing.reference };
  } else {
    // Mode Création
    const duplicates = findDuplicates(data.clients, { ...input, phoneE164, email: input.email || undefined });
    if (duplicates.length > 0 && !input.confirmDuplicate) {
      return {
        message: "Un client semblable existe déjà. Vérifiez avant de créer une nouvelle fiche.",
        duplicates: duplicates.map((d) => ({
          id: d.client.id,
          label: `${d.client.firstName} ${d.client.lastName} (${d.client.reference})`,
          reasons: d.reasons,
        })),
        values,
      };
    }
    // Le numéro CLI-… est attribué par la base.
    const { data: row, error } = await supabase
      .from("clients")
      .insert({ ...clientToRow(fields), organization_id: ctx.organizationId, is_demo_fixture: false })
      .select("id, reference")
      .single();
    if (error) return { message: dbMessage(error), values };
    saved = { id: String(row.id), reference: String(row.reference) };
  }

  // Numéro complet de la pièce d'identité : table protégée à part.
  if (input.idDocNumber !== undefined) {
    const { error } = await supabase
      .from("client_sensitive")
      .upsert({ client_id: saved.id, organization_id: ctx.organizationId, id_doc_number: input.idDocNumber || null }, { onConflict: "client_id" });
    if (error) return { message: dbMessage(error, "La fiche est enregistrée, mais pas le numéro de la pièce d'identité."), values };
  }

  await supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.member.id,
    client_id: saved.id,
    text: existing ? `Fiche client ${saved.reference} modifiée.` : `Fiche client ${saved.reference} créée.`,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${saved.id}`);
  redirect(`/clients/${saved.id}?ok=${existing ? "client-modifie" : "client-cree"}`);
}

export const createClientAction = saveClientAction;

export async function updateClientAction(
  clientId: string,
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  formData.set("clientId", clientId);
  return saveClientAction(prev, formData);
}

/**
 * Suppression définitive d'une fiche, réservée aux responsables. Un client qui a des dossiers ne peut
 * pas être supprimé : l'historique des démarches et les reçus doivent être conservés.
 */
export async function deleteClientAction(clientId: string): Promise<{ ok: boolean; message?: string }> {
  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "client.delete")) return { ok: false, message: FORBIDDEN_MESSAGE };

  const { count, error: countError } = await ctx.supabase.from("cases").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  if (countError) return { ok: false, message: dbMessage(countError) };
  if (count) {
    return {
      ok: false,
      message: "Ce client a des dossiers : sa fiche ne peut pas être supprimée, car l'historique des démarches et les reçus doivent être conservés.",
    };
  }

  const { data: deleted, error } = await ctx.supabase.from("clients").delete().eq("id", clientId).select("reference, first_name, last_name");
  if (error) return { ok: false, message: dbMessage(error) };
  const client = deleted?.[0];
  if (!client) return { ok: false, message: "Client introuvable." };

  await ctx.supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.member.id,
    text: `Fiche client ${client.reference} (${client.first_name} ${client.last_name}) supprimée définitivement.`,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
