import type { InvoiceImageKind } from "@/lib/domain/types";

// Images des factures (logo, cachet, signature), partagées par le navigateur (contrôle immédiat) et
// le serveur. Le bucket applique les mêmes limites (supabase/migrations/20261031120000_factures.sql).
// PNG ou JPEG seulement : ce sont les formats que le PDF sait intégrer.

export const BRANDING_BUCKET = "branding";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = ".png,.jpg,.jpeg";

/** Chemin imposé par la base : {agence}/{type}-{horodatage}.{ext}. */
export function brandingPath(organizationId: string, kind: InvoiceImageKind, type: string, at = Date.now()): string {
  return `${organizationId}/${kind}-${at}.${type === "image/png" ? "png" : "jpg"}`;
}
