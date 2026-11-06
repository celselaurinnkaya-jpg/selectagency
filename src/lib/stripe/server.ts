import "server-only";
import Stripe from "stripe";

// Client Stripe, uniquement côté serveur : la clé secrète n'est jamais envoyée au navigateur, ni écrite dans les
// réponses ou les journaux. Version d'API : celle de la bibliothèque installée (stripe 23.1 : 2026-10-28.endive).

export function getStripe(): Stripe | null {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!/^(sk|rk)_(test|live)_/.test(apiKey)) return null;
  return new Stripe(apiKey, { appInfo: { name: "SELECT Agency", version: "1.0.0" } });
}

/** Paiement par carte des abonnements possible sur ce serveur (clé secrète et secret du webhook présents). */
export function isStripeConfigured(): boolean {
  return /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY?.trim() ?? "") && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

/** « test » ou « live » selon la clé secrète (affiché dans la console, jamais la clé). */
export function stripeMode(): "test" | "live" | null {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return apiKey.includes("_test_") ? "test" : apiKey.includes("_live_") ? "live" : null;
}
