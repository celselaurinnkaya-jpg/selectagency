import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { fetchRows } from "@/lib/data/agency";
import { MESSAGE_TEMPLATE, toMessageTemplate } from "@/lib/data/rows";
import type { MessageTemplate } from "@/lib/domain/types";

/** Modèles de messages de l'agence, dans l'ordre choisi. */
export async function loadMessageTemplates(ctx: AgencyContext): Promise<MessageTemplate[]> {
  const rows = await fetchRows(ctx, "message_templates", MESSAGE_TEMPLATE.list, undefined, ["position", "id"]);
  return rows.map(toMessageTemplate);
}

/** Page « Paramètres > Modèles de messages ». */
export async function getMessageTemplatesPage() {
  const ctx = await getAgencyContext();
  return {
    templates: await loadMessageTemplates(ctx),
    canManage: allowed(ctx, "settings.manage"),
    agencyName: ctx.agency.name,
  };
}

/** Campagnes déjà saisies par l'agence (suggestions des formulaires, même orthographe d'une fiche à l'autre). */
export async function loadCampaigns(ctx: AgencyContext): Promise<string[]> {
  const rows = await fetchRows(ctx, "clients", "id, campaign", (q) => q.not("campaign", "is", null));
  const seen = new Map<string, string>();
  for (const row of rows) {
    const value = String(row.campaign ?? "").trim();
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}
