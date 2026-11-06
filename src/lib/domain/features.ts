import type { PlanTier, Subscription } from "./types";

// Options selon la formule (STARTER, PRO, BUSINESS). Cette règle reproduit private.org_has_feature
// (supabase/migrations/20261106110000_formules.sql) : l'écran grise les options non incluses, mais c'est la
// base qui refuse d'y créer des données.

export type Feature = "invoices" | "services" | "partners" | "auto_emails" | "custom_workflows" | "reports";

export const FEATURES: readonly Feature[] = ["invoices", "services", "partners", "auto_emails", "custom_workflows", "reports"];

export const FEATURE_LABEL: Record<Feature, string> = {
  invoices: "Factures",
  services: "Services",
  partners: "Partenaires et commissions",
  auto_emails: "E-mails automatiques",
  custom_workflows: "Modèles d'étapes personnalisés",
  reports: "Rapports et exports",
};

/**
 * Les options réservées (toutes celles de PRO) sont-elles ouvertes ? Oui pendant l'essai, dans une démonstration,
 * avec une ancienne formule sans palier, en PRO et en BUSINESS. Non en STARTER.
 */
export function proFeaturesOpen(isDemo: boolean, subscription: Subscription | undefined): boolean {
  if (isDemo || !subscription) return true;
  if (subscription.status === "trialing") return true;
  return subscription.plan?.tier !== "starter";
}

/** Options fermées pour l'agence (liste vide si tout est ouvert). */
export function lockedFeatures(isDemo: boolean, subscription: Subscription | undefined): Feature[] {
  return proFeaturesOpen(isDemo, subscription) ? [] : [...FEATURES];
}

/** Entrées du menu réservées à une option. */
export const NAV_FEATURE: Record<string, Feature> = {
  "/services": "services",
  "/partners": "partners",
  "/reports": "reports",
};

/** Ce que comprend chaque formule, pour la page Abonnement et l'accueil. */
export const TIER_INCLUDES: Record<PlanTier, string[]> = {
  starter: [
    "Clients et prospects",
    "Dossiers, étapes et pièces",
    "Rendez-vous et tâches",
    "Paiements, reçus et devis",
    "Envoi des documents par e-mail",
  ],
  pro: [
    "Tout STARTER",
    "Factures",
    "Services et réservations",
    "Partenaires et commissions",
    "E-mails automatiques (rappels, relances, avancement)",
    "Modèles d'étapes personnalisés",
    "Rapports et exports",
  ],
  business: ["Tout PRO", "Support prioritaire", "Nouvelles options en premier"],
};

export const TIER_ORDER: readonly PlanTier[] = ["starter", "pro", "business"];
