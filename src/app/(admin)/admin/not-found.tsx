import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/ui";

// Adresse inconnue dans la console (agence ou demande supprimée, lien erroné) : retour à la console.
export default function ConsoleNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={SearchX}
        title="Page introuvable dans la console"
        description="Cette agence, cette demande ou cette page n'existe pas (ou plus)."
        action={
          <Link href="/admin" className="inline-flex min-h-10 items-center rounded-lg bg-navy-800 px-4 text-sm font-medium text-white hover:bg-navy-700">
            Retour à la vue d&apos;ensemble
          </Link>
        }
      />
    </div>
  );
}
