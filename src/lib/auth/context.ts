import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { MEMBER, ORGANIZATION, PLAN, SUBSCRIPTION, toAgency, toMember, toPlan, toSubscription } from "@/lib/data/rows";
import { lockedFeatures, type Feature } from "@/lib/domain/features";
import { canWrite, demoEndsAt } from "@/lib/domain/subscription";
import type { Agency, Member, Subscription } from "@/lib/domain/types";

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
  /** Absent pour une agence de démonstration. */
  subscription?: Subscription;
  /** Agence de démonstration : date à partir de laquelle elle n'est plus que consultable. */
  demoEndsAt?: string;
  /** Faux quand l'abonnement est suspendu, résilié ou l'essai terminé : l'agence est en lecture seule. */
  writable: boolean;
  /** Options non incluses dans la formule (STARTER) : affichées grisées, refusées par la base. */
  locked: Feature[];
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
    .is("removed_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Lecture du compte impossible : ${error.message}`);
  if (!memberRow) redirect("/onboarding");

  const organizationId = String(memberRow.organization_id);
  const [{ data: orgRow, error: orgError }, { data: subscriptionRow, error: subscriptionError }] = await Promise.all([
    user.supabase.from("organizations").select(ORGANIZATION.list).eq("id", organizationId).single(),
    user.supabase.from("subscriptions").select(SUBSCRIPTION.list).eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (orgError) throw new Error(`Lecture de l'agence impossible : ${orgError.message}`);
  if (subscriptionError) throw new Error(`Lecture de l'abonnement impossible : ${subscriptionError.message}`);

  let subscription: Subscription | undefined;
  if (subscriptionRow) {
    const planId = subscriptionRow.plan_id as string | null;
    const { data: planRow } = planId ? await user.supabase.from("plans").select(PLAN.list).eq("id", planId).maybeSingle() : { data: null };
    subscription = toSubscription(subscriptionRow, planRow ? toPlan(planRow) : undefined);
  }
  const isDemo = Boolean(orgRow.is_demo);
  const demoEnd = isDemo && orgRow.created_at ? demoEndsAt(String(orgRow.created_at)) : undefined;

  return {
    ...user,
    organizationId,
    isDemo,
    agency: toAgency(orgRow),
    member: toMember(memberRow),
    subscription,
    demoEndsAt: demoEnd,
    writable: canWrite(isDemo, subscription, new Date(), demoEnd),
    locked: lockedFeatures(isDemo, subscription),
  };
});
