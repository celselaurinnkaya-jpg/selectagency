import { safeFileName } from "@/features/documents/storage";

// Justificatifs des dépenses (photo ou PDF du reçu), dans un bucket privé : mêmes formats et même taille
// maximale que les pièces des dossiers (supabase/migrations/20261122160000_depenses_justificatifs.sql).

export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

/** Chemin imposé par la base : {agence}/{horodatage}-{nom}. */
export function expenseReceiptPath(organizationId: string, fileName: string, at = Date.now()): string {
  return `${organizationId}/${at}-${safeFileName(fileName)}`;
}
