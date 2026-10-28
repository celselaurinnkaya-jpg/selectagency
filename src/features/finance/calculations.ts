import type { Charge, Expense, Payment } from "@/lib/domain/types";

// Calculs financiers (plan §9.5). Règles :
// - montants en unités mineures (entiers), jamais de nombres flottants ;
// - aucune somme entre devises différentes ;
// - les sommes reçues pour des tiers (frais officiels, établissements) ne sont pas des revenus de l'agence.

export interface CaseFinance {
  currency: string;
  agreedAgencyMinor: number;
  agreedThirdPartyMinor: number;
  agreedMinor: number;
  paidMinor: number;
  balanceMinor: number;
  overpaidMinor: number;
  unallocatedMinor: number;
}

const recorded = (payments: Payment[]) => payments.filter((p) => p.status === "recorded");
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function assertCurrency(currency: string, items: { currency: string }[]) {
  const other = items.find((item) => item.currency !== currency);
  if (other) throw new Error(`Devise incohérente : ${other.currency} dans un dossier facturé en ${currency}`);
}

export function caseFinance(currency: string, charges: Charge[], payments: Payment[]): CaseFinance {
  const paid = recorded(payments);
  assertCurrency(currency, [...charges, ...paid]);
  const agreedAgencyMinor = sum(charges.filter((c) => c.chargeType === "agency_fee").map((c) => c.amountMinor));
  const agreedThirdPartyMinor = sum(charges.filter((c) => c.chargeType === "third_party").map((c) => c.amountMinor));
  const agreedMinor = agreedAgencyMinor + agreedThirdPartyMinor;
  const paidMinor = sum(paid.map((p) => p.amountMinor));
  const allocatedMinor = sum(paid.flatMap((p) => p.allocations.map((a) => a.amountMinor)));
  const difference = agreedMinor - paidMinor;
  return {
    currency,
    agreedAgencyMinor,
    agreedThirdPartyMinor,
    agreedMinor,
    paidMinor,
    balanceMinor: Math.max(0, difference),
    overpaidMinor: Math.max(0, -difference),
    unallocatedMinor: paidMinor - allocatedMinor,
  };
}

export interface ChargeProgress {
  charge: Charge;
  allocatedMinor: number;
  remainingMinor: number;
}

export function chargeProgress(charges: Charge[], payments: Payment[]): ChargeProgress[] {
  const paid = recorded(payments);
  return charges.map((charge) => {
    const allocatedMinor = sum(paid.flatMap((p) => p.allocations.filter((a) => a.chargeId === charge.id).map((a) => a.amountMinor)));
    return { charge, allocatedMinor, remainingMinor: Math.max(0, charge.amountMinor - allocatedMinor) };
  });
}

export interface AgencyFinance {
  currency: string;
  receivedMinor: number;
  agencyRevenueMinor: number;
  thirdPartyReceivedMinor: number;
  operatingExpensesMinor: number;
  disbursementsMinor: number;
  estimatedMarginMinor: number;
  /** Fonds reçus pour des tiers et pas encore reversés (cumul, indépendant de la période). */
  thirdPartyHeldMinor: number;
}

export interface Period {
  from?: Date;
  to?: Date;
}

const inPeriod = (iso: string, period: Period) => {
  const time = new Date(iso).getTime();
  return (!period.from || time >= period.from.getTime()) && (!period.to || time < period.to.getTime());
};

/** Synthèse par devise. Une agence qui facture en plusieurs devises obtient une ligne par devise. */
export function agencyFinance(charges: Charge[], payments: Payment[], expenses: Expense[], period: Period): AgencyFinance[] {
  const chargeType = new Map(charges.map((c) => [c.id, c.chargeType]));
  const paid = recorded(payments);
  const currencies = [...new Set([...paid.map((p) => p.currency), ...expenses.map((e) => e.currency)])].sort();

  return currencies.map((currency) => {
    const allPayments = paid.filter((p) => p.currency === currency);
    const allExpenses = expenses.filter((e) => e.currency === currency);
    const periodPayments = allPayments.filter((p) => inPeriod(p.paidAt, period));
    const periodExpenses = allExpenses.filter((e) => inPeriod(e.paidAt, period));

    const allocated = (list: Payment[], type: "agency_fee" | "third_party") =>
      sum(list.flatMap((p) => p.allocations.filter((a) => chargeType.get(a.chargeId) === type).map((a) => a.amountMinor)));
    const expensesOf = (list: Expense[], type: Expense["expenseType"]) =>
      sum(list.filter((e) => e.expenseType === type).map((e) => e.amountMinor));

    const agencyRevenueMinor = allocated(periodPayments, "agency_fee");
    const operatingExpensesMinor = expensesOf(periodExpenses, "operating");
    return {
      currency,
      receivedMinor: sum(periodPayments.map((p) => p.amountMinor)),
      agencyRevenueMinor,
      thirdPartyReceivedMinor: allocated(periodPayments, "third_party"),
      operatingExpensesMinor,
      disbursementsMinor: expensesOf(periodExpenses, "client_disbursement"),
      estimatedMarginMinor: agencyRevenueMinor - operatingExpensesMinor,
      thirdPartyHeldMinor: allocated(allPayments, "third_party") - expensesOf(allExpenses, "client_disbursement"),
    };
  });
}
