import { FlaskConical, RotateCcw } from "lucide-react";
import { resetDemoAction } from "@/features/demo/actions";

// Bandeau permanent tant que l'application fonctionne sur des données fictives (règle du plan, Phase 3).
export function DemoBanner() {
  return (
    <div role="note" className="border-b border-citron-500 bg-citron-100 px-4 py-2 text-navy-900 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-center sm:gap-4">
        <p className="flex items-start gap-2 sm:items-center">
          <FlaskConical className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden />
          <span>
            <strong>Démonstration :</strong> les données sont fictives et les modifications sont perdues au redémarrage du serveur.
            N&apos;y saisissez aucune information réelle.
          </span>
        </p>
        <form action={resetDemoAction} className="pl-6 sm:pl-0">
          <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 font-medium text-navy-800 underline underline-offset-2 hover:text-navy-600">
            <RotateCcw className="size-3.5" aria-hidden />
            Réinitialiser les données
          </button>
        </form>
      </div>
    </div>
  );
}
