import "server-only";
import { formatMoney, minorUnits } from "@/lib/format";
import { convert, type EuroRates } from "@/features/finance/currency-converter";
import { getEuroRates } from "@/features/finance/exchange-rates";

// Équivalent indicatif en dollars américains des prix des formules (demande de l'utilisateur du 24/11/2026).
// La facturation reste en FCFA ; le montant en dollars suit le taux du jour de la Banque centrale européenne
// (le franc CFA est lié à l'euro, pas au dollar).

/** « ≈ 12,51 $US », ou rien si le cours du jour n'est pas disponible. */
export function usdApprox(amountMinor: number, currency: string, rates: EuroRates | null): string | undefined {
  if (!rates || currency === "USD") return undefined;
  const usd = convert(amountMinor / 10 ** minorUnits(currency), currency, "USD", rates.rates);
  if (usd === undefined || !Number.isFinite(usd)) return undefined;
  return `≈ ${formatMoney(Math.round(usd * 100), "USD")}`;
}

/** Équivalent en dollars d'un montant (composant serveur : lit le cours du jour, en cache). */
export async function UsdEquivalent({ amountMinor, currency, className }: { amountMinor: number; currency: string; className?: string }) {
  const text = usdApprox(amountMinor, currency, await getEuroRates());
  return text ? <span className={className}>{text}</span> : null;
}

/** Prix publics des formules, en FCFA par mois : les mêmes que la migration 20261124120000 (à changer ensemble). */
export const PUBLIC_PRICES = { starter: 7500, pro: 10500, business: 15500 } as const;

/** Réponse « Combien coûte SELECT Agency ? » du site, avec l'équivalent en dollars au taux du jour. */
export async function PricingAnswer() {
  const rates = await getEuroRates();
  const price = (amount: number) => {
    const usd = usdApprox(amount, "XAF", rates);
    return `${formatMoney(amount, "XAF")}${usd ? ` (${usd})` : ""}`;
  };
  return (
    <>
      Le premier mois est gratuit, avec toutes les options. Ensuite, trois formules mensuelles : STARTER à {price(PUBLIC_PRICES.starter)} (2
      membres : clients, dossiers, pièces, rendez-vous, paiements, reçus et devis), PRO à {price(PUBLIC_PRICES.pro)} (5 membres, avec en plus
      factures, services, partenaires, e-mails automatiques, modèles d&apos;étapes, rapports, Agent IA et site web) et BUSINESS à{" "}
      {price(PUBLIC_PRICES.business)} (membres illimités, support prioritaire). Paiement en FCFA par Mobile Money, virement ou carte bancaire
      {rates ? " ; le montant en dollars est indicatif, au taux du jour" : ""}.
    </>
  );
}
