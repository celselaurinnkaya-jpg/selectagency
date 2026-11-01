import { Suspense } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/context";
import { signOutAction } from "@/features/auth/actions";

// En-tête de la console SELECT : même bleu marine que l'espace agence, avec la mention « Console »
// sur pastille jaune pour qu'on ne confonde jamais les deux espaces.

async function ConsoleUser() {
  const user = await getSessionUser();
  if (!user) return null;
  return <span className="hidden max-w-56 truncate text-sm text-navy-100 md:block">{user.email}</span>;
}

export function ConsoleHeader() {
  return (
    <header className="sticky top-0 z-40 bg-navy-900 text-white shadow-md print:hidden">
      <div className="flex h-16 items-center gap-3 px-3 sm:gap-4 sm:px-5">
        <Link href="/admin" className="flex shrink-0 items-center gap-3" aria-label="Console SELECT, vue d'ensemble">
          <Logo priority className="h-8 sm:h-9" />
          <span className="rounded-full bg-citron-400 px-2.5 py-0.5 text-xs font-semibold text-navy-900">Console</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Suspense fallback={null}>
            <ConsoleUser />
          </Suspense>
          <Button asChild variant="onNavy" size="sm" className="h-10">
            <Link href="/dashboard">
              <LayoutDashboard aria-hidden />
              <span className="hidden sm:inline">Espace agence</span>
            </Link>
          </Button>
          <form action={signOutAction}>
            <Button type="submit" variant="onNavy" size="sm" className="h-10" aria-label="Se déconnecter">
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
