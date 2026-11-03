import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { fetchRows, readAgency } from "@/lib/data/agency";
import { PARTNER, PARTNER_COMMISSION, toPartner, toPartnerCommission } from "@/lib/data/rows";
import type { CommissionStatus, Partner, PartnerCommission } from "@/lib/domain/types";
import { dayKey } from "@/lib/format";

// Partenaires et commissions. Les partenaires sont lisibles par toute l'équipe (pour reconnaître un
// code) ; les commissions, par les rôles qui voient la finance (la base applique la même règle).

const UUID = /^[0-9a-f-]{36}$/i;

export async function loadPartners(ctx: AgencyContext): Promise<Partner[]> {
  return (await fetchRows(ctx, "partners", PARTNER.list)).map(toPartner).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function loadCommissions(ctx: AgencyContext, partnerId?: string): Promise<PartnerCommission[]> {
  if (!allowed(ctx, "finance.read")) return [];
  return (await fetchRows(ctx, "partner_commissions", PARTNER_COMMISSION.list, partnerId ? (q) => q.eq("partner_id", partnerId) : undefined)).map(toPartnerCommission);
}

/** Totaux par devise (jamais d'addition entre devises). */
function totalsBy(commissions: PartnerCommission[], status: CommissionStatus) {
  const byCurrency = new Map<string, number>();
  for (const c of commissions) if (c.status === status) byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + c.amountMinor);
  return [...byCurrency].map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/** Partenaire actif dont le code correspond (majuscules et espaces ignorés). */
export function partnerByCode(partners: Partner[], code: string): Partner | undefined {
  const wanted = code.replace(/\s+/g, "").toUpperCase();
  return partners.find((p) => p.code === wanted);
}

export async function listPartners() {
  const ctx = await getAgencyContext();
  const [partners, commissions, { data, now }] = await Promise.all([loadPartners(ctx), loadCommissions(ctx), readAgency({ clients: true })]);
  const month = dayKey(now, data.agency.timezone).slice(0, 7);
  return {
    canManage: allowed(ctx, "partners.manage"),
    canSeeCommissions: allowed(ctx, "finance.read"),
    partners: partners.map((partner) => {
      const own = commissions.filter((c) => c.partnerId === partner.id);
      return {
        partner,
        clients: data.clients.filter((c) => c.partnerId === partner.id).length,
        toPay: totalsBy(own, "approved"),
        paid: totalsBy(own, "paid"),
      };
    }),
    totals: {
      active: partners.filter((p) => p.isActive).length,
      clients: data.clients.filter((c) => c.partnerId).length,
      toPay: totalsBy(commissions, "approved"),
      paidThisMonth: totalsBy(commissions.filter((c) => c.paidAt && dayKey(c.paidAt, data.agency.timezone).startsWith(month)), "paid"),
    },
  };
}

export async function getPartner(id: string) {
  if (!UUID.test(id)) return null;
  const ctx = await getAgencyContext();
  const [[row], commissions, { data, now }] = await Promise.all([
    fetchRows(ctx, "partners", PARTNER.list, (q) => q.eq("id", id)),
    loadCommissions(ctx, id),
    readAgency({ clients: (q) => q.eq("partner_id", id), cases: true }),
  ]);
  if (!row) return null;
  const partner = toPartner(row);
  return {
    partner,
    agency: data.agency,
    now,
    clients: data.clients
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
      .map((client) => ({
        client,
        activeCases: data.cases.filter((k) => k.clientId === client.id && k.status === "active").length,
        commission: commissions.find((c) => c.clientId === client.id),
      })),
    toPay: totalsBy(commissions, "approved"),
    paid: totalsBy(commissions, "paid"),
    pending: totalsBy(commissions, "pending"),
    permissions: { manage: allowed(ctx, "partners.manage"), commissions: allowed(ctx, "commission.manage"), seeCommissions: allowed(ctx, "finance.read") },
  };
}

export async function getPartnerForEdit(id?: string) {
  const ctx = await getAgencyContext();
  if (id && !UUID.test(id)) return null;
  const [row] = id ? await fetchRows(ctx, "partners", PARTNER.list, (q) => q.eq("id", id)) : [];
  if (id && !row) return null;
  return { partner: row ? toPartner(row) : undefined, canManage: allowed(ctx, "partners.manage"), currency: ctx.agency.currency };
}
