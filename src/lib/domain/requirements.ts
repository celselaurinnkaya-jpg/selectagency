import type { DocumentRequirement } from "./types";

// Une seule règle pour « pièce manquante », partout (dossier, page Documents, tableau de bord) :
// une pièce obligatoire non reçue, à corriger (refusée avec un motif) ou expirée manque encore au dossier.
// (Rapport de re-test du 22/11 : le dossier comptait les pièces à corriger, la page Documents non.)

export function isMissingRequired(r: Pick<DocumentRequirement, "isRequired" | "status">): boolean {
  return r.isRequired && (r.status === "not_received" || r.status === "to_correct" || r.status === "expired");
}
