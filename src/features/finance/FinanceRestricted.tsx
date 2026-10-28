import { Notice } from "@/components/shared/ui";

/** Affiché au rôle « lecture seule », qui n'a pas accès aux montants (la base ne lui renvoie aucune ligne). */
export function FinanceRestricted() {
  return (
    <Notice title="Finance non accessible">
      Votre rôle permet de consulter les clients et les dossiers, mais pas les montants, les paiements ni les dépenses.
    </Notice>
  );
}
