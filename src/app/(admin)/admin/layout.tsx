import { Suspense } from "react";
import type { Metadata } from "next";
import { ConsoleHeader } from "@/components/layout/ConsoleHeader";
import { ConsoleNav, ConsoleNavFallback } from "@/components/layout/ConsoleNav";

// Cadre de la console SELECT. Il ne vérifie pas l'accès lui-même (un layout n'est pas réévalué à
// chaque navigation) : chaque page et chaque action appelle requirePlatformAdmin().

export const metadata: Metadata = { title: { default: "Console SELECT", template: "%s · Console SELECT" }, robots: { index: false } };

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-citron-400 px-3 py-2 font-semibold text-navy-900 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <ConsoleHeader />
      <Suspense fallback={<ConsoleNavFallback layout="bar" />}>
        <ConsoleNav layout="bar" />
      </Suspense>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-surface px-3 py-4 lg:block print:hidden">
          <p className="mb-4 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Plateforme SELECT</p>
          <Suspense fallback={<ConsoleNavFallback />}>
            <ConsoleNav />
          </Suspense>
        </aside>
        <main id="contenu" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
