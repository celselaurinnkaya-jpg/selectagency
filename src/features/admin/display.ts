import { SUBSCRIPTION_STATUS, type LabelSpec } from "@/lib/domain/labels";
import { daysLeft, effectiveStatus } from "@/lib/domain/subscription";
import type { SubscriptionStatus } from "@/lib/domain/types";

// Affichage commun aux pages de la console SELECT.

/** Fuseau de l'équipe SELECT : dates affichées et saisies dans la console. */
export const CONSOLE_TIMEZONE = "Africa/Douala";

const TRIAL_WARNING_DAYS = 7;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

interface AgencyStatusInput {
  isDemo: boolean;
  status?: SubscriptionStatus;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

/** Statut d'une agence vu par la console, avec ce qui demande une action de SELECT. */
export function agencyStatus(agency: AgencyStatusInput, now: Date): { spec: LabelSpec; attention?: string } {
  if (agency.isDemo) return { spec: { label: "Démonstration", tone: "neutral" } };
  if (!agency.status) return { spec: { label: "Sans abonnement", tone: "danger" }, attention: "Aucun abonnement enregistré" };
  const status = effectiveStatus({ status: agency.status, trialEndsAt: agency.trialEndsAt }, now);
  const spec = SUBSCRIPTION_STATUS[status];
  if (status === "trialing" && agency.trialEndsAt && daysLeft(agency.trialEndsAt, now) <= TRIAL_WARNING_DAYS) {
    return { spec, attention: `Essai : plus que ${daysLeft(agency.trialEndsAt, now)} jour(s)` };
  }
  if (status === "trial_expired") return { spec, attention: "Essai terminé : agence en lecture seule" };
  if (status === "past_due") return { spec, attention: "Paiement en retard" };
  if (status === "suspended") return { spec, attention: "Agence suspendue" };
  if (status === "active" && agency.currentPeriodEnd && new Date(agency.currentPeriodEnd).getTime() < now.getTime()) {
    return { spec, attention: "Échéance dépassée" };
  }
  return { spec };
}

export const AUDIT_ACTIONS: Record<string, string> = {
  "plan.created": "Formule créée",
  "plan.updated": "Formule modifiée",
  "plan.stripe": "Tarif Stripe de la formule modifié",
  "subscription.updated": "Abonnement modifié",
  "subscription_payment.recorded": "Paiement d'abonnement enregistré",
  "subscription_payment.voided": "Paiement d'abonnement annulé",
  "support.replied": "Réponse au support",
  "support.status_changed": "Statut d'une demande modifié",
};

/** Mois « 2026-10 » → « octobre 2026 ». */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 15)));
}
