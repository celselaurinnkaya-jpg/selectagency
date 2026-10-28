import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { MEMBER, ORGANIZATION, toAgency, toMember } from "@/lib/data/rows";
import type { Agency, Member } from "@/lib/domain/types";

// Couche d'accès à la session (Data Access Layer). Toute lecture et toute Server Action commence ici :
// la session est vérifiée côté serveur, jamais déduite du navigateur. React.cache évite de relire la
// session plusieurs fois pendant le rendu d'une même requête.

export interface SessionUser {
  supabase: SupabaseServerClient;
  userId: string;
  email: string;
  fullName: string;
}

export interface AgencyContext extends SessionUser {
  organizationId: string;
  isDemo: boolean;
  agency: Agency;
  member: Member;
}

/** Personne connectée, sans exiger d'agence (inscription, création de l'agence, invitation). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const metadata = (claims.user_metadata ?? {}) as { full_name?: string };
  return { supabase, userId: claims.sub, email: String(claims.email ?? ""), fullName: metadata.full_name?.trim() ?? "" };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Personne connectée et son agence. Redirige vers la connexion ou la création d'agence au besoin. */
export const getAgencyContext = cache(async (): Promise<AgencyContext> => {
  const user = await requireSessionUser();
  const { data: memberRow, error } = await user.supabase
    .from("members")
    .select(MEMBER.list)
    .eq("user_id", user.userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Lecture du compte impossible : ${error.message}`);
  if (!memberRow) redirect("/onboarding");

  const { data: orgRow, error: orgError } = await user.supabase
    .from("organizations")
    .select(ORGANIZATION.list)
    .eq("id", memberRow.organization_id)
    .single();
  if (orgError) throw new Error(`Lecture de l'agence impossible : ${orgError.message}`);

  return {
    ...user,
    organizationId: String(orgRow.id),
    isDemo: Boolean(orgRow.is_demo),
    agency: toAgency(orgRow),
    member: toMember(memberRow),
  };
});
