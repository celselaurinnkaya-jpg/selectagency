// Règles d'envoi des pièces, partagées par le navigateur (contrôle immédiat) et le serveur.
// Le bucket applique les mêmes limites (supabase/migrations/20261028100400_stockage.sql).

export const DOCUMENTS_BUCKET = "documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_DOCUMENT_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";

/** Nom de fichier sûr pour un chemin de stockage (sans accents, espaces ni caractères spéciaux). */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return (cleaned || "document").slice(-120);
}

/** Chemin imposé par la base : {agence}/{dossier}/{pièce}/{horodatage}-{nom}. */
export function documentPath(organizationId: string, caseId: string, requirementId: string, fileName: string, at = Date.now()): string {
  return `${organizationId}/${caseId}/${requirementId}/${at}-${safeFileName(fileName)}`;
}
