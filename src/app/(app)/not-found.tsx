import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

// Élément introuvable dans l'espace de travail : le menu reste disponible.
// Un dossier inexistant et un dossier d'une autre agence afficheront le même message.
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-surface p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="mt-3 text-xl font-semibold text-navy-800">Élément introuvable</h1>
      <p className="mt-2 text-sm text-slate-600">Ce client, ce dossier ou ce reçu n&apos;existe pas, ou vous n&apos;y avez pas accès.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/clients">Clients</Link>
        </Button>
        <Button asChild>
          <Link href="/cases">Dossiers</Link>
        </Button>
      </div>
    </div>
  );
}
