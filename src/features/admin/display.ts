import { SUBSCRIPTION_STATUS, TICKET_CATEGORY, type LabelSpec } from "@/lib/domain/labels";
import { daysLeft, effectiveStatus, graceEndsAt } from "@/lib/domain/subscription";
import type { SubscriptionStatus, TicketCategory } from "@/lib/domain/types";
import { formatDate, formatMoney } from "@/lib/format";

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
  isInternal?: boolean;
  status?: SubscriptionStatus;
  planId?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

/** Statut vécu par l'agence (essai terminé, retard, lecture seule après le délai de grâce). */
export function agencyEffectiveStatus(agency: AgencyStatusInput, now: Date) {
  return agency.status
    ? effectiveStatus({ status: agency.status, trialEndsAt: agency.trialEndsAt, currentPeriodEnd: agency.currentPeriodEnd, isInternal: agency.isInternal }, now)
    : undefined;
}

/** Statut d'une agence vu par la console, avec ce qui demande une action de SELECT. */
export function agencyStatus(agency: AgencyStatusInput, now: Date): { spec: LabelSpec; attention?: string } {
  if (agency.isDemo) return { spec: { label: "Démonstration", tone: "neutral" } };
  if (!agency.status) return { spec: { label: "Sans abonnement", tone: "danger" }, attention: "Aucun abonnement enregistré" };
  const status = agencyEffectiveStatus(agency, now)!;
  // Agence interne (équipe SELECT) : accès inchangé, rien à encaisser ; seules une suspension ou une résiliation se signalent.
  if (agency.isInternal && status !== "suspended" && status !== "cancelled") return { spec: { label: "Interne", tone: "neutral" } };
  const spec = SUBSCRIPTION_STATUS[status];
  if (status === "trialing" && agency.trialEndsAt && daysLeft(agency.trialEndsAt, now) <= TRIAL_WARNING_DAYS) {
    return { spec, attention: `Essai : plus que ${daysLeft(agency.trialEndsAt, now)} jour(s)` };
  }
  if (status === "trial_expired") return { spec, attention: "Essai terminé : agence en lecture seule" };
  if (status === "overdue") return { spec, attention: "Échéance dépassée depuis plus de 7 jours : agence en lecture seule" };
  if (status === "past_due") {
    return {
      spec,
      attention: agency.currentPeriodEnd
        ? `Paiement en retard : lecture seule le ${formatDate(graceEndsAt(agency.currentPeriodEnd), CONSOLE_TIMEZONE)} sans paiement`
        : "Paiement en retard",
    };
  }
  if (status === "suspended") return { spec, attention: "Agence suspendue" };
  if (status === "active" && !agency.planId) return { spec, attention: "Active sans formule : à corriger, ou marquer l'agence interne" };
  if (status === "active" && !agency.currentPeriodEnd) return { spec, attention: "Active sans échéance : à fixer, ou marquer l'agence interne" };
  return { spec };
}

/** Ville saisie par l'agence, avec une majuscule à chaque mot (« BRAZZAVILLE », « brazzaville » → « Brazzaville »). */
export function displayCity(city: string): string {
  return city
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase("fr-FR"));
}

export const AUDIT_ACTIONS: Record<string, string> = {
  "plan.created": "Formule créée",
  "plan.updated": "Formule modifiée",
  "plan.stripe": "Tarif Stripe de la formule modifié",
  "subscription.updated": "Abonnement modifié",
  "subscription.created": "Abonnement créé (essai gratuit)",
  "subscription.changed": "Abonnement modifié hors de la console",
  "subscription.internal_on": "Agence marquée interne",
  "subscription.internal_off": "Agence redevenue cliente",
  "support.category_changed": "Catégorie d'une demande corrigée",
  "subscription_payment.recorded": "Paiement d'abonnement enregistré",
  "subscription_payment.voided": "Paiement d'abonnement annulé",
  "support.replied": "Réponse au support",
  "support.status_changed": "Statut d'une demande modifié",
  "whatsapp.configured": "Ligne WhatsApp configurée",
  "whatsapp.disconnected": "Ligne WhatsApp déconnectée",
};

/** Origine d'un changement d'abonnement fait hors de la console. */
export const AUDIT_SOURCES: Record<string, string> = {
  stripe: "Stripe (paiement par carte)",
  application: "application (personne connectée)",
  database: "base de données (éditeur SQL, script ou migration)",
};

/** Résumé lisible des détails enregistrés avec une action du journal. */
export function auditSummary(details: Record<string, unknown>): string {
  const d = details;
  const parts: string[] = [];
  if (typeof d.source === "string") parts.push(`origine : ${AUDIT_SOURCES[d.source] ?? d.source}`);
  if (typeof d.plan === "string") parts.push(`formule « ${d.plan} »`);
  if (typeof d.ticket === "string") parts.push(`demande ${d.ticket}`);
  if (typeof d.amount_minor === "number" && typeof d.currency === "string") parts.push(formatMoney(d.amount_minor, d.currency));
  if (typeof d.reference === "string") parts.push(`réf. ${d.reference}`);
  const before = d.before as { status?: SubscriptionStatus } | string | null | undefined;
  const after = d.after as { status?: SubscriptionStatus } | string | undefined;
  if (typeof after === "string") {
    // Catégorie d'une demande de support.
    const label = (c: unknown) => TICKET_CATEGORY[c as TicketCategory] ?? String(c);
    parts.push(`catégorie : ${typeof before === "string" ? `${label(before)} → ` : ""}${label(after)}`);
  } else if (after?.status) {
    const from = typeof before === "object" && before?.status && before.status !== after.status ? `${SUBSCRIPTION_STATUS[before.status]?.label ?? before.status} → ` : "";
    parts.push(`statut : ${from}${SUBSCRIPTION_STATUS[after.status]?.label ?? after.status}`);
  }
  if (typeof d.reason === "string") parts.push(`motif : « ${d.reason} »`);
  return parts.join(" · ");
}

/** Mois « 2026-10 » → « octobre 2026 ». */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 15)));
}
