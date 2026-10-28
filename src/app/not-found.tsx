import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

// Page introuvable. Un dossier d'une autre agence renverra aussi cette page (404 et non 403),
// pour ne jamais révéler son existence.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-navy-800 px-6 text-center text-white">
      <Logo className="h-12 sm:h-14" />
      <h1 className="mt-8 text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-2 max-w-md text-navy-100">
        Cette adresse ne correspond à aucune page, ou l&apos;élément demandé n&apos;existe pas ou plus.
      </p>
      <Button asChild variant="accent" className="mt-6">
        <Link href="/dashboard">Retour au tableau de bord</Link>
      </Button>
    </main>
  );
}
