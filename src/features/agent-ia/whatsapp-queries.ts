import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import { toWaAccount, type WaAccountRecord } from "@/lib/domain/ai";

export interface WhatsAppConnectionPageData {
  accounts: WaAccountRecord[];
  isLocked: boolean;
  canManage: boolean;
  agencyName: string;
  maxWaNumbers: number;
}

export async function loadWhatsAppConnectionData(): Promise<WhatsAppConnectionPageData> {
  const ctx = await getAgencyContext();
  const isLocked = ctx.locked.includes("ai_agent");
  const canManage = ["owner", "admin"].includes(ctx.member.role);

  if (isLocked) {
    return {
      accounts: [],
      isLocked: true,
      canManage: false,
      agencyName: ctx.agency.name,
      maxWaNumbers: 0,
    };
  }

  const { data: rawAccounts, error } = await ctx.supabase
    .from("wa_accounts")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("connected_at", { ascending: false });

  if (error) {
    console.error("Erreur lors de la lecture des comptes WhatsApp :", error);
  }

  const accounts = (rawAccounts ?? []).map(toWaAccount);
  const plan = ctx.subscription?.plan;
  const maxWaNumbers = plan?.maxWaNumbers ?? (ctx.subscription?.plan?.tier === "business" ? 1 : 1);

  return {
    accounts,
    isLocked: false,
    canManage,
    agencyName: ctx.agency.name,
    maxWaNumbers,
  };
}

