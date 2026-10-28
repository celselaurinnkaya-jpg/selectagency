import type { PaymentAllocation, PaymentMethodKind } from "@/lib/domain/types";
import { minorUnits } from "@/lib/format";
import type { ChargeProgress } from "./calculations";

// Règles de saisie d'un encaissement, partagées par le formulaire et la Server Action.
// La base revérifie tout (fonction record_payment) : montant, répartition, reste à payer.

export const PAYMENT_METHODS: { value: string; kind: PaymentMethodKind; label: string }[] = [
  { value: "cash", kind: "cash", label: "Espèces" },
  { value: "orange_money", kind: "mobile_money", label: "Orange Money" },
  { value: "mtn_momo", kind: "mobile_money", label: "MTN Mobile Money" },
  { value: "wave", kind: "mobile_money", label: "Wave" },
  { value: "moov_money", kind: "mobile_money", label: "Moov Money" },
  { value: "airtel_money", kind: "mobile_money", label: "Airtel Money" },
  { value: "mpesa", kind: "mobile_money", label: "M-Pesa" },
  { value: "bank_transfer", kind: "bank_transfer", label: "Virement bancaire" },
  { value: "other", kind: "other", label: "Autre moyen" },
];

/**
 * Montant saisi (« 150 000 », « 99,90 ») → unités mineures entières. Renvoie null si la saisie
 * n'est pas un montant positif valide pour la devise (trop de décimales, lettres…).
 */
export function parseAmount(input: string, currency: string): number | null {
  const digits = minorUnits(currency);
  const compact = input.replace(/[\s  ]/g, "").replace(",", ".");
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(compact)) return null;
  const [whole, fraction = ""] = compact.split(".") as [string, string?];
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || 0);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Répartit un paiement sur les prestations non soldées, dans l'ordre où elles ont été convenues. */
export function allocateFifo(amountMinor: number, charges: ChargeProgress[]): PaymentAllocation[] | null {
  const allocations: PaymentAllocation[] = [];
  let rest = amountMinor;
  for (const { charge, remainingMinor } of charges) {
    if (rest === 0) break;
    if (remainingMinor <= 0) continue;
    const part = Math.min(rest, remainingMinor);
    allocations.push({ chargeId: charge.id, amountMinor: part });
    rest -= part;
  }
  return rest === 0 ? allocations : null;
}
