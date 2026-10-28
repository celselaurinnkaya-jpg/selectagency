"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Erreur inattendue : message utile, sans détail technique, avec l'identifiant pour le support.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-surface p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-50 text-red-700">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-3 text-xl font-semibold text-navy-800">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="mt-2 text-sm text-slate-600">
        Vérifiez votre connexion puis réessayez. Si le problème continue, transmettez la référence ci-dessous.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-500">Référence : {error.digest}</p>}
      <Button className="mt-4" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
