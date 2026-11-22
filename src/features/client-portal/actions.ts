"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext, requireSessionUser } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { siteUrl } from "@/lib/env";
import type { FormState } from "@/lib/form-state";

// Espace client : l'agence crée un lien personnel lié à une adresse e-mail ; le client, connecté avec cette
// adresse, ouvre son espace (avancement en lecture seule, dépôt de ses pièces). La base revérifie tout
// (supabase/migrations/20261122200000_espace_client.sql).

/** Agence : crée (ou renouvelle) le lien de l'espace d'un client. */
export async function createClientPortalAccessAction(clientId: string, email: string): Promise<FormState> {
  if (!z.uuid().safeParse(clientId).success) return { message: "Client introuvable." };
  const address = email.trim().toLowerCase();
  if (!z.email().safeParse(address).success) return { message: "Adresse e-mail invalide." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { data, error } = await ctx.supabase.rpc("create_client_portal_access", { p_client_id: clientId, p_email: address });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Lien de l'espace client créé.", redirectTo: `${siteUrl()}/acces-client/${data as string}` };
}

/** Agence : retire l'accès (le client ne voit plus rien). */
export async function revokeClientPortalAccessAction(clientId: string): Promise<FormState> {
  if (!z.uuid().safeParse(clientId).success) return { message: "Client introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { error } = await ctx.supabase.rpc("revoke_client_portal_access", { p_client_id: clientId });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Accès retiré : le client ne voit plus son espace." };
}

/** Client : ouvre son espace avec le lien reçu, connecté avec l'adresse à laquelle il a été envoyé. */
export async function acceptClientPortalAccessAction(token: string): Promise<FormState> {
  if (!z.uuid().safeParse(token).success) return { message: "Lien invalide." };
  const user = await requireSessionUser();
  const { error } = await user.supabase.rpc("accept_client_portal_access", { p_token: token });
  if (error) return { message: dbMessage(error) };
  return { ok: true, redirectTo: "/espace-client" };
}

const uploadSchema = z.object({
  requirementId: z.uuid(),
  storagePath: z.string().min(10).max(400),
  fileName: z.string().trim().min(1).max(200),
});

/** Client : rattache à la pièce le fichier qu'il vient de déposer (la pièce passe « à vérifier » par l'agence). */
export async function portalRegisterUploadAction(input: { requirementId: string; storagePath: string; fileName: string }): Promise<FormState> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { message: "Envoi incomplet : recommencez." };
  const user = await requireSessionUser();
  const { error } = await user.supabase.rpc("portal_add_requirement_file", {
    p_requirement_id: parsed.data.requirementId,
    p_storage_path: parsed.data.storagePath,
    p_file_name: parsed.data.fileName,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Document reçu : l'agence va le vérifier." };
}
