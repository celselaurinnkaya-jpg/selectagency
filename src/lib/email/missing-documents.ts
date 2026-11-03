// Pièces manquantes d'un dossier, telles qu'elles sont annoncées au client. La même description sert à l'aperçu
// montré à l'agent avant l'envoi et à l'e-mail lui-même : le client reçoit exactement ce que l'agent a vu.

export interface MissingDocumentItem {
  label: string;
  /** État de la pièce : not_received, to_correct ou expired. */
  status: string;
  /** Motif de la correction demandée (pièce « à corriger »). */
  comment?: string;
}

/** Ce que le client doit faire pour cette pièce. */
export function missingDocumentNote(status: string, comment?: string): string {
  if (status === "to_correct") return comment?.trim() ? `À corriger : ${comment.trim()}` : "À corriger";
  if (status === "expired") return "Expirée : à renouveler";
  return "À fournir";
}

/** Lit la liste enregistrée dans l'e-mail (objets) ou une ancienne liste de simples libellés. */
export function parseMissingDocuments(raw: unknown): MissingDocumentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): MissingDocumentItem | null => {
      if (typeof entry === "string") return entry.trim() ? { label: entry.trim(), status: "not_received" } : null;
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        const label = typeof e.label === "string" ? e.label.trim() : "";
        if (!label) return null;
        return {
          label,
          status: typeof e.status === "string" ? e.status : "not_received",
          comment: typeof e.comment === "string" && e.comment.trim() ? e.comment.trim() : undefined,
        };
      }
      return null;
    })
    .filter((item): item is MissingDocumentItem => item !== null);
}
