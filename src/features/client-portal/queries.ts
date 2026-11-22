import "server-only";
import type { AgencyContext } from "@/lib/auth/context";
import { requireSessionUser } from "@/lib/auth/context";
import { siteUrl } from "@/lib/env";
import type { CaseOutcome, CaseStatus, RequirementStatus, StepKind } from "@/lib/domain/types";

// Lectures de l'espace client (côté client) et de son accès (côté agence).

export interface PortalCase {
  id: string;
  reference: string;
  title: string;
  status: CaseStatus;
  outcome: CaseOutcome;
  destination_country: string;
  steps: { label: string; status: "pending" | "in_progress" | "done" | "skipped"; kind: StepKind }[];
  requirements: { id: string; label: string; status: RequirementStatus; is_required: boolean; comment: string | null }[];
  next_appointment: { title: string; starts_at: string; all_day: boolean; location: string | null } | null;
}

export interface PortalAgency {
  organization_id: string;
  agency_name: string;
  agency_timezone: string;
  agency_phone: string;
  agency_email: string;
  client_first_name: string;
  cases: PortalCase[];
}

/** Espace du client connecté : ses dossiers dans chaque agence qui lui a ouvert un espace. */
export async function getClientPortal() {
  const user = await requireSessionUser();
  const { data, error } = await user.supabase.rpc("client_portal");
  if (error) throw new Error(`Lecture de l'espace client impossible : ${error.message}`);
  return { user, agencies: (data ?? []) as PortalAgency[] };
}

/** Côté agence : l'espace d'un client est-il ouvert, ou un lien attend-il d'être utilisé ? */
export async function getClientPortalAccess(ctx: AgencyContext, clientId: string) {
  const { data, error } = await ctx.supabase
    .from("client_portal_access")
    .select("email, token, user_id, accepted_at")
    .eq("organization_id", ctx.organizationId)
    .eq("client_id", clientId)
    .maybeSingle();
  // Avant la migration 20261122200000, la table n'existe pas : l'encadré ne s'affiche pas.
  if (error) return undefined;
  return {
    email: data?.email ? String(data.email) : undefined,
    hasAccess: Boolean(data?.user_id),
    pendingLink: data?.token ? `${siteUrl()}/acces-client/${String(data.token)}` : undefined,
  };
}
