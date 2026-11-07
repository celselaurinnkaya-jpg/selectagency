import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ROLE } from "@/lib/domain/labels";
import { initials } from "@/lib/format";
import { getShell } from "@/features/operations/queries";
import { AgencyMobileMenu } from "./AgencyNav";
import { MobileMenu, NewMenu, UserMenu } from "./HeaderMenus";

// Barre supérieure bleu marine pleine largeur (référence UNIP) : le logo est dessiné pour ce fond.

// Logo de l'agence (Paramètres > Factures) sur un fond blanc arrondi : un logo sombre reste lisible sur le bleu marine.
async function AgencyName() {
  const { agency, logoUrl } = await getShell();
  return (
    // Sans logo, rien n'est affiché sur téléphone (le nom n'y a pas la place).
    <span className={`min-w-0 items-center gap-3 border-l border-white/25 pl-3 sm:pl-4 ${logoUrl ? "flex" : "hidden md:flex"}`}>
      {logoUrl && (
        // Image privée servie par l'application (session requise) : pas d'optimisation next/image possible.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`Logo de ${agency.name}`}
          className="h-9 w-auto max-w-16 shrink-0 rounded-md bg-white object-contain p-0.5 sm:h-10 sm:max-w-28"
        />
      )}
      <span className="hidden truncate text-base font-semibold text-white md:block">{agency.name}</span>
    </span>
  );
}

async function HeaderActions() {
  const { member, showConsole } = await getShell();
  return (
    <>
      <NewMenu />
      <UserMenu fullName={member.fullName} roleLabel={ROLE[member.role].label} initials={initials(member.fullName)} showConsole={showConsole} />
    </>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-navy-800 text-white shadow-md print:hidden">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-5">
        <Suspense fallback={<MobileMenu />}>
          <AgencyMobileMenu />
        </Suspense>
        <Link href="/dashboard" className="shrink-0" aria-label="SELECT Agency, tableau de bord">
          <Logo priority className="h-8 sm:h-9" />
        </Link>
        <Suspense fallback={null}>
          <AgencyName />
        </Suspense>
        <Form action="/search" role="search" className="mx-auto hidden w-full max-w-md lg:block">
          <label htmlFor="recherche-globale" className="sr-only">
            Rechercher un client ou un dossier
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-200" aria-hidden />
            <input
              id="recherche-globale"
              name="q"
              type="search"
              placeholder="Rechercher un client, un dossier, un téléphone…"
              className="h-10 w-full rounded-lg border border-white/15 bg-white/10 pr-3 pl-9 text-sm text-white placeholder:text-navy-200 focus:border-citron-400 focus:bg-white/15 focus:outline-none"
            />
          </div>
        </Form>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-3 lg:ml-0">
          <Button asChild variant="onNavy" size="icon" className="lg:hidden">
            <Link href="/search" aria-label="Rechercher">
              <Search className="size-5" />
            </Link>
          </Button>
          <Suspense fallback={<div className="h-10 w-28" />}>
            <HeaderActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
