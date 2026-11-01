import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./context";

// Accès à la console SELECT. Comme pour l'espace agence, le contrôle est fait au plus près des
// données : chaque page et chaque action de la console appelle requirePlatformAdmin(), et chaque
// fonction platform_* de la base revérifie le rôle et la double authentification.

export type PlatformAccess = "none" | "mfa" | "ok";

export const getPlatformAccess = cache(async (): Promise<{ user: SessionUser | null; access: PlatformAccess }> => {
  const user = await getSessionUser();
  if (!user) return { user: null, access: "none" };
  const { data, error } = await user.supabase.rpc("platform_access");
  if (error) throw new Error(`Vérification de l'accès à la console impossible : ${error.message}`);
  return { user, access: data as PlatformAccess };
});

/**
 * Administrateur SELECT connecté avec la double authentification. Sans connexion : page de
 * connexion. Sans ce rôle : page introuvable, et aucune donnée de la console n'est lue.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const { user, access } = await getPlatformAccess();
  if (!user) redirect("/login?next=/admin");
  if (access === "none") notFound();
  if (access === "mfa") redirect("/admin/verification");
  return user;
}

/** Variante pour les Server Actions, qui renvoient un message au lieu de rediriger. */
export async function platformAdminForAction(): Promise<SessionUser | null> {
  const { user, access } = await getPlatformAccess();
  return user && access === "ok" ? user : null;
}

export const CONSOLE_FORBIDDEN = "Action réservée à l'équipe SELECT, connectée avec la double authentification.";
