import type { PaymentMethodKind } from "@/lib/domain/types";

export interface CashClosing {
  id: string;
  organizationId: string;
  /** Bureau de la caisse (vide : toute l'agence). */
  bureauId?: string;
  closingDate: string;
  currency: string;
  closedBy: string;
  closedByName?: string;
  closedAt: string;
  expectedCashMinor: number;
  actualCashMinor: number;
  discrepancyMinor: number;
  totalCollectedMinor: number;
  breakdown: Partial<Record<PaymentMethodKind, number>>;
  notes?: string;
}

export interface DayCashSummary {
  date: string;
  currency: string;
  expectedCashMinor: number;
  totalCollectedMinor: number;
  breakdown: Partial<Record<PaymentMethodKind, number>>;
  paymentsCount: number;
  closing?: CashClosing;
}
