"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { db, reference } from "@/lib/demo/store";
import { formValues, type FormState } from "@/lib/form-state";
import type { Client } from "@/lib/domain/types";
import { findDuplicates } from "./duplicates";

// Validation côté serveur : une Server Action est un point d'accès public, on ne fait jamais
// confiance aux contrôles du navigateur. (L'authentification et les rôles arrivent en Phase 6.)

const clientSchema = z.object({
  clientId: z.string().optional(),
  firstName: z.string().trim().min(1, "Indiquez le prénom.").max(80),
  lastName: z.string().trim().min(1, "Indiquez le nom.").max(80),
  clientType: z.enum(["individual", "student", "professional", "company"], { error: "Choisissez un type de client." }),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  nationality: z.string().trim().max(80).optional(),
  maritalStatus: z.string().optional(),
  idDocType: z.string().optional(),
  idDocNumber: z.string().trim().max(50).optional(),
  serviceMotive: z.string().optional(),

  residenceCountry: z.string().trim().min(1, "Choisissez ou indiquez le pays de résidence.").max(80),
  city: z.string().trim().min(1, "Indiquez la ville.").max(80),
  address: z.string().trim().max(250).optional(),
  phone: z.string().trim().min(6, "Indiquez le numéro de téléphone."),
  whatsapp: z.string().trim().optional(),
  email: z.union([z.literal(""), z.string().trim().email("Adresse e-mail invalide.")]).optional(),
  preferredLanguage: z.string().min(1, "Choisissez la langue de communication."),

  // Responsables
  isSelfResponsible: z.string().optional(),
  guardian1Name: z.string().trim().max(100).optional(),
  guardian1Phone: z.string().trim().max(40).optional(),
  guardian1Whatsapp: z.string().trim().max(40).optional(),
  guardian2Name: z.string().trim().max(100).optional(),
  guardian2Phone: z.string().trim().max(40).optional(),
  guardian2Whatsapp: z.string().trim().max(40).optional(),

  // Suivi par l'agence (inchangé)
  assignedTo: z.string().min(1, "Choisissez le conseiller."),
  notes: z.string().trim().max(2000).optional(),
  confirmDuplicate: z.literal("1").optional(),
});

function toE164(raw: string | undefined, country: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (country && country.length === 2) {
    const parsed = parsePhoneNumberFromString(trimmed, country as CountryCode);
    if (parsed?.isValid()) return parsed.number;
  }
  const parsedDirect = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
  if (parsedDirect?.isValid()) return parsedDirect.number;
  if (trimmed.replace(/\D/g, "").length >= 6) {
    return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  }
  return null;
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

  const data = db();
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

  const now = new Date();

  if (clientId) {
    // Mode Modification
    const index = data.clients.findIndex((c) => c.id === clientId);
    if (index === -1) {
      return { message: "Ce client n'existe pas ou a été supprimé.", values };
    }

    const existing = data.clients[index];
    const updatedClient: Client = {
      ...existing,
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
      idDocNumber: input.idDocNumber || undefined,
      passportLast4: input.idDocNumber ? input.idDocNumber.trim().slice(-4) : existing.passportLast4,
      address: input.address || undefined,
      serviceMotive: input.serviceMotive || undefined,

      isSelfResponsible: isSelf,
      guardian1,
      guardian2,
    };

    data.clients[index] = updatedClient;
    data.events.push({
      id: crypto.randomUUID(),
      at: now.toISOString(),
      actorId: data.currentMemberId,
      clientId: updatedClient.id,
      text: `Fiche client ${updatedClient.reference} modifiée.`,
    });

    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/edit`);
    redirect(`/clients/${clientId}?ok=client-modifie`);
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

    const client: Client = {
      id: crypto.randomUUID(),
      reference: reference("CLI", "client", now.getFullYear()),
      clientType: input.clientType,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email || undefined,
      phoneE164,
      whatsappE164: whatsappE164 ?? undefined,
      residenceCountry: input.residenceCountry,
      city: input.city,
      preferredLanguage: input.preferredLanguage,
      registeredAt: now.toISOString(),
      assignedTo: input.assignedTo,
      notes: input.notes || undefined,
      isDemoFixture: false,

      gender: input.gender || undefined,
      birthDate: input.birthDate || undefined,
      nationality: input.nationality || undefined,
      maritalStatus: input.maritalStatus || undefined,
      idDocType: input.idDocType || undefined,
      idDocNumber: input.idDocNumber || undefined,
      passportLast4: input.idDocNumber ? input.idDocNumber.trim().slice(-4) : undefined,
      address: input.address || undefined,
      serviceMotive: input.serviceMotive || undefined,

      isSelfResponsible: isSelf,
      guardian1,
      guardian2,
    };

    data.clients.push(client);
    data.events.push({
      id: crypto.randomUUID(),
      at: now.toISOString(),
      actorId: data.currentMemberId,
      clientId: client.id,
      text: `Fiche client ${client.reference} créée.`,
    });

    revalidatePath("/clients");
    revalidatePath(`/clients/${client.id}`);
    redirect(`/clients/${client.id}?ok=client-cree`);
  }
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

export async function deleteClientAction(clientId: string): Promise<{ ok: boolean; message?: string }> {
  const data = db();
  const index = data.clients.findIndex((c) => c.id === clientId);
  if (index === -1) {
    return { ok: false, message: "Client introuvable." };
  }

  const client = data.clients[index];
  data.clients.splice(index, 1);

  data.events.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: data.currentMemberId,
    text: `Fiche client ${client.reference} (${client.firstName} ${client.lastName}) supprimée définitivement.`,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
