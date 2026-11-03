import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { signOutAction } from "@/features/auth/actions";

// Espace partenaire : en-tête de la marque et déconnexion, sans menu de l'agence (le partenaire n'en est pas membre).
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-40 bg-navy-800 text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo className="h-8" />
          <form action={signOutAction}>
            <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white hover:bg-navy-700">
              <LogOut className="size-4" aria-hidden />
              Se déconnecter
            </button>
          </form>
        </div>
      </header>
      <main id="contenu" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
