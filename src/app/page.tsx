import Link from "next/link";
import { CalendarDays, FileText, FolderKanban, ListChecks, Users, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

// Page d'accueil publique provisoire. La vraie page commerciale (tarifs, FAQ, démonstration)
// est prévue en Phase 8 ; ici, aucune promesse ni chiffre qui ne serait pas vérifiable.

const MODULES = [
  { icon: Users, title: "Clients", text: "Une fiche unique par client, avec ses coordonnées, ses dossiers et son historique." },
  { icon: FolderKanban, title: "Dossiers", text: "Études, visas, voyages : des étapes claires, en distinguant ce qui dépend de l'agence, du client ou d'un organisme." },
  { icon: FileText, title: "Documents", text: "Les pièces reçues, à vérifier, à corriger ou manquantes, par dossier." },
  { icon: CalendarDays, title: "Rendez-vous", text: "Entretiens, dépôts et échéances au même endroit." },
  { icon: ListChecks, title: "Tâches", text: "Le travail de chaque membre de l'équipe et les retards à rattraper." },
  { icon: Wallet, title: "Paiements", text: "Acomptes, soldes et reçus, en séparant les frais de l'agence des montants destinés à des tiers." },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-white">
      <section className="bg-navy-800 px-6 py-14 text-white sm:py-20">
        <div className="mx-auto max-w-5xl">
          <Logo priority className="h-16 sm:h-20" />
          <h1 className="mt-8 max-w-2xl text-3xl font-semibold sm:text-4xl">La gestion intelligente des agences de voyages</h1>
          <p className="mt-4 max-w-2xl text-lg text-navy-100">
            Centralisez vos clients, vos dossiers de visa et d&apos;études, vos documents, vos rendez-vous et vos paiements dans
            un seul outil, utilisable sur téléphone comme sur ordinateur.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/dashboard">Ouvrir la démonstration</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-navy-200">
            Logiciel en cours de développement : la démonstration utilise uniquement des données fictives.
          </p>
        </div>
      </section>
      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="rounded-xl bg-surface p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-navy-800 text-citron-400">
                <m.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-lg font-semibold text-navy-800">{m.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{m.text}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-5xl text-sm text-slate-500">
          SELECT Agency est un outil de gestion. Il ne garantit l&apos;obtention d&apos;aucun visa ni d&apos;aucune admission :
          ces décisions relèvent exclusivement des autorités et des établissements concernés.
        </p>
      </section>
    </main>
  );
}
