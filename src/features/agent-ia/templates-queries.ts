import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import { toWaTemplate, type WaTemplateRecord } from "@/lib/domain/ai";

export interface TemplatesPageData {
  templates: WaTemplateRecord[];
  isLocked: boolean;
  canManage: boolean;
  agencyName: string;
}

export async function loadTemplatesPageData(): Promise<TemplatesPageData> {
  const ctx = await getAgencyContext();
  const isLocked = ctx.locked.includes("ai_agent");
  const canManage = ["owner", "admin"].includes(ctx.member.role);

  if (isLocked) {
    return {
      templates: [],
      isLocked: true,
      canManage: false,
      agencyName: ctx.agency.name,
    };
  }

  const { data: rawTemplates, error } = await ctx.supabase
    .from("wa_templates")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur de lecture des modèles WhatsApp :", error);
  }

  const templates = (rawTemplates ?? []).map(toWaTemplate);

  return {
    templates,
    isLocked: false,
    canManage,
    agencyName: ctx.agency.name,
  };
}

