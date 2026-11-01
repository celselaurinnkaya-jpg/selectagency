import type { Subscription, SubscriptionStatus } from "./types";

// Règles d'abonnement. Elles reproduisent private.org_can_write (supabase/migrations) : l'écran
// prévient et désactive les boutons, mais c'est la base qui bloque les écritures.

export type EffectiveStatus = SubscriptionStatus | "trial_expired";

/** Statut vécu par l'agence : un essai dont la date est passée est « terminé ». */
export function effectiveStatus(subscription: Subscription, now: Date): EffectiveStatus {
  if (subscription.status === "trialing" && subscription.trialEndsAt && new Date(subscription.trialEndsAt).getTime() <= now.getTime()) {
    return "trial_expired";
  }
  return subscription.status;
}

/** L'agence peut-elle enregistrer de nouvelles données ? Sinon, elle reste consultable. */
export function canWrite(isDemo: boolean, subscription: Subscription | undefined, now: Date): boolean {
  if (isDemo) return true;
  if (!subscription) return false;
  const status = effectiveStatus(subscription, now);
  return status === "trialing" || status === "active" || status === "past_due";
}

/** Nombre de jours entiers restants avant une date (0 si elle est passée). */
export function daysLeft(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}
