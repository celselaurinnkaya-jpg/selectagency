import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ROLE } from "@/lib/domain/labels";
import { initials } from "@/lib/format";
import { getShell } from "@/features/operations/queries";
import { MobileMenu, NewMenu, UserMenu } from "./HeaderMenus";

// Barre supérieure bleu marine pleine largeur (référence UNIP) : le logo est dessiné pour ce fond.

async function AgencyName() {
  const { agency } = await getShell();
  return (
    <span className="hidden truncate border-l border-white/25 pl-4 text-base font-semibold text-white md:block">
      {agency.name}
    </span>
  );
}

async function HeaderActions() {
  const { member } = await getShell();
  return (
    <>
      <NewMenu />
      <UserMenu fullName={member.fullName} roleLabel={ROLE[member.role].label} initials={initials(member.fullName)} />
    </>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-navy-800 text-white shadow-md print:hidden">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-5">
        <MobileMenu />
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
