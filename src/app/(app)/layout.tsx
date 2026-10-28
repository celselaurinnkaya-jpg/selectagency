import { Suspense } from "react";
import { Menu } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { SidebarNav, SidebarNavFallback } from "@/components/layout/SidebarNav";

// Cadre commun de l'espace de travail : il n'est rendu qu'une fois et persiste entre les pages.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-citron-400 px-3 py-2 font-semibold text-navy-900 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <AppHeader />
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-surface px-3 py-4 lg:block print:hidden">
          <p className="mb-4 flex items-center justify-center gap-2 text-xl font-semibold text-navy-800">
            <Menu className="size-6" aria-hidden />
            Menu
          </p>
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarNav />
          </Suspense>
        </aside>
        <main id="contenu" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
