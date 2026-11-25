import "server-only";
import { allowed } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { activeMembers } from "@/lib/domain/members";
import { bureauLimit, openBureaux } from "./display";

/** Page Paramètres → Bureaux : bureaux, membres et leurs rattachements, réglage de visibilité, limite de la formule. */
export async function getBureauxPage() {
  const { data, ctx } = await readAgency({ clients: true });
  const clientsPerBureau = new Map<string, number>();
  for (const c of data.clients) if (c.bureauId) clientsPerBureau.set(c.bureauId, (clientsPerBureau.get(c.bureauId) ?? 0) + 1);
  const limit = bureauLimit(ctx.isDemo, ctx.subscription);
  return {
    bureaux: data.bureaux.map((b) => ({ ...b, clients: clientsPerBureau.get(b.id) ?? 0 })),
    members: activeMembers(data.members).filter((m) => m.hasAccount !== false),
    canManage: allowed(ctx, "settings.manage"),
    isOwner: ctx.member.role === "owner" && ctx.writable,
    restrictByBureau: Boolean(data.agency.restrictByBureau),
    limit,
    canAdd: limit === undefined || openBureaux(data.bureaux).length < limit,
    clientsWithoutBureau: data.clients.filter((c) => !c.bureauId && !c.archivedAt).length,
  };
}
