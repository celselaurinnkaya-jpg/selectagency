import type Stripe from "stripe";

// Lecture des messages Stripe (version d'API 2026-10-28.endive) : où trouver l'agence, la période payée et le
// tarif. Fonctions pures, sans appel réseau.
// - La fin de la période payée est portée par les éléments de l'abonnement (SubscriptionItem.current_period_end)
//   et par les lignes de la facture (period.end), plus par l'abonnement lui-même.
// - L'agence est notée par l'application dans les métadonnées de la session et de l'abonnement (organization_id).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant d'un objet Stripe donné sous forme de texte ou d'objet développé. */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Agence notée dans les métadonnées (uniquement un identifiant valide). */
export function organizationFromMetadata(metadata: Record<string, string> | null | undefined): string | null {
  const value = metadata?.organization_id?.trim();
  return value && UUID.test(value) ? value.toLowerCase() : null;
}

const toIso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/** Fin de la période payée d'un abonnement : la plus tardive de ses éléments. */
export function subscriptionPeriodEnd(subscription: Pick<Stripe.Subscription, "items">): string | null {
  const ends = (subscription.items?.data ?? []).map((item) => item.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? toIso(Math.max(...ends)) : null;
}

/** Tarif de l'abonnement (formule choisie), y compris après un changement fait sur la page Stripe. */
export function subscriptionPriceId(subscription: Pick<Stripe.Subscription, "items">): string | null {
  const item = (subscription.items?.data ?? []).find((i) => i.price);
  return idOf(item?.price as string | { id: string } | undefined);
}

export interface InvoiceFacts {
  invoiceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  amountPaid: number;
  currency: string;
  periodEnd: string | null;
  number: string | null;
  organizationId: string | null;
}

/** Ce qu'il faut retenir d'une facture d'abonnement payée ; null si ce n'est pas une facture d'abonnement. */
export function invoiceFacts(invoice: Stripe.Invoice): InvoiceFacts | null {
  const details = invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details : null;
  const subscriptionId = idOf(details?.subscription as string | { id: string } | null | undefined);
  if (!subscriptionId || !invoice.id) return null;
  const lines = invoice.lines?.data ?? [];
  const ends = lines.map((line) => line.period?.end).filter((n): n is number => typeof n === "number");
  // Changement de formule facturé aussitôt : la facture porte un avoir sur l'ancien tarif (montant négatif) et le
  // reste de la période au nouveau tarif. La formule payée est celle de la ligne au plus gros montant.
  const priceLine = lines
    .filter((line) => line.pricing?.price_details?.price)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  return {
    invoiceId: invoice.id,
    customerId: idOf(invoice.customer as string | { id: string } | null),
    subscriptionId,
    priceId: idOf(priceLine?.pricing?.price_details?.price as string | { id: string } | undefined),
    amountPaid: invoice.amount_paid ?? 0,
    currency: (invoice.currency ?? "").toUpperCase(),
    periodEnd: ends.length ? toIso(Math.max(...ends)) : null,
    number: invoice.number ?? null,
    organizationId: organizationFromMetadata(details?.metadata ?? null),
  };
}
