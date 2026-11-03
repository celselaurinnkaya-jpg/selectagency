import "server-only";
import type { AgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { loadPartners, partnerByCode } from "./queries";

// Code partenaire saisi sur la fiche d'un client ou d'un prospect : contrôlé avant l'enregistrement,
// puis appliqué par la base (set_client_partner crée ou déplace la commission, note l'historique).

/** Partenaire correspondant au code saisi ; null si aucun code ; message si le code est inconnu ou inactif. */
export async function resolvePartnerCode(ctx: AgencyContext, code: string | undefined): Promise<{ partnerId: string | null } | { error: string }> {
  const wanted = code?.trim();
  if (!wanted) return { partnerId: null };
  const partner = partnerByCode(await loadPartners(ctx), wanted);
  if (!partner) return { error: "Code partenaire inconnu : vérifiez-le auprès du partenaire, ou laissez le champ vide." };
  if (!partner.isActive) return { error: `Le partenaire ${partner.name} est désactivé : réactivez-le avant de lui rattacher un client.` };
  return { partnerId: partner.id };
}

/** Rattache (ou détache) le client si le partenaire change. Renvoie un message en cas de refus. */
export async function applyClientPartner(ctx: AgencyContext, clientId: string, current: string | undefined, partnerId: string | null): Promise<string | undefined> {
  if ((current ?? null) === partnerId) return undefined;
  const { error } = await ctx.supabase.rpc("set_client_partner", { p_client_id: clientId, p_partner_id: partnerId });
  return error ? dbMessage(error) : undefined;
}
