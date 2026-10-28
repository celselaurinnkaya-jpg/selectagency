import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

// Pages de compte (connexion, inscription, création de l'agence) : bandeau bleu marine de la marque,
// formulaire sur fond blanc. Sur téléphone, le bandeau se réduit au logo.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className="bg-linear-to-r from-navy-900 via-navy-800 to-navy-600 px-4 py-5 text-white sm:px-6 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <Link href="/" aria-label="SELECT Agency, accueil" className="inline-block">
          <Logo priority className="h-9 lg:h-12" />
        </Link>
        <div className="hidden lg:block">
          <p className="max-w-md text-3xl font-semibold leading-tight">La gestion intelligente des agences de voyages</p>
          <p className="mt-4 max-w-md text-navy-100">
            Clients, dossiers de visa et d&apos;études, documents, rendez-vous et paiements, au même endroit, sur téléphone comme sur ordinateur.
          </p>
        </div>
        <p className="hidden max-w-md text-sm text-navy-200 lg:block">
          SELECT Agency est un outil de gestion : il ne garantit l&apos;obtention d&apos;aucun visa ni d&apos;aucune admission.
        </p>
      </aside>
      <main id="contenu" className="flex justify-center px-4 py-8 sm:px-6 lg:items-center lg:py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
