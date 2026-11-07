"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { clientToRow } from "@/lib/data/rows";
import { formValues, type FormState } from "@/lib/form-state";
import type { Client } from "@/lib/domain/types";
import { CLIENT_SOURCE } from "@/lib/domain/labels";
import { duplicateLabel, findDuplicates } from "./duplicates";
import { toE164 } from "./phone";
import { applyClientPartner, resolvePartnerCode } from "@/features/partners/link";
import { activeMembers } from "@/lib/domain/members";

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
  source: z.union([z.literal(""), z.enum(Object.keys(CLIENT_SOURCE) as [string, ...string[]])]).optional(),
  sourceDetail: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(120, "La campagne est limitée à 120 caractères.").optional(),
  partnerCode: z.string().trim().max(20).optional(),
  assignedTo: z.string().min(1, "Choisissez le conseiller."),
  notes: z.string().trim().max(2000).optional(),
  confirmDuplicate: z.literal("1").optional(),
});

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
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write"), values };
  if (!activeMembers(data.members).some((m) => m.id === input.assignedTo)) {
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
  // Code partenaire : contrôlé avant tout enregistrement.
  const partner = await resolvePartnerCode(ctx, input.partnerCode);
  if ("error" in partner) return { message: "Certains champs sont à corriger.", fieldErrors: { partnerCode: [partner.error] }, values };

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
    source: (input.source || undefined) as Client["source"],
    sourceDetail: input.sourceDetail || undefined,
    campaign: input.campaign || undefined,
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
        duplicates: duplicates.map((d) => ({ id: d.client.id, label: duplicateLabel(d.client), reasons: d.reasons })),
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

  // L'historique (« Fiche client … créée / modifiée ») est écrit par la base.
  // Partenaire : la base crée ou déplace la commission (refus si elle est déjà payée).
  const partnerError = await applyClientPartner(ctx, saved.id, existing?.partnerId, partner.partnerId);

  revalidatePath("/clients");
  revalidatePath(`/clients/${saved.id}`);
  redirect(`/clients/${saved.id}?ok=${existing ? "client-modifie" : "client-cree"}${partnerError ? "&partenaire=refuse" : ""}`);
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
  if (!allowed(ctx, "client.delete")) return { ok: false, message: forbiddenMessage(ctx, "client.delete") };

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
  // L'historique (« Fiche client … supprimée définitivement ») est écrit par la base.

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
