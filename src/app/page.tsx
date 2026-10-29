import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Clock,
  Compass,
  FileText,
  FolderKanban,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Lock,
  type LucideIcon,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plane,
  Receipt,
  Route,
  Send,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "cn";
import { Logo } from "@/components/brand/Logo";
import { Notice, PlannedAction, SectionTitle } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { HeroPreview, PhonePreview } from "@/features/landing/visuals";
import { WORKFLOW_DISCLAIMER, WORKFLOW_TEMPLATES } from "@/features/workflows/templates";
import { isDemoEnabled } from "@/lib/env";
import type { CaseCategory, StepKind } from "@/lib/domain/types";

// Page d'accueil publique. Règle du plan (Phase 8) : aucune affirmation invérifiable, donc ni faux
// clients, ni faux logos de partenaires, ni faux chiffres. Les chiffres affichés viennent de
// l'application elle-même (modèles de dossiers, rôles, modes de paiement).

const NAV = [
  { href: "#parcours", label: "Parcours" },
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#securite", label: "Sécurité" },
  { href: "#questions", label: "Questions" },
  { href: "#contact", label: "Contact" },
];

// Coordonnées FICTIVES, affichées comme telles, en attendant les vraies : à remplacer ici.
// Volontairement sans lien (mailto:, tel:, wa.me) : rien ne doit partir vers une adresse inventée.
// Le domaine .example est réservé et ne peut appartenir à personne.
const CONTACT: { icon: LucideIcon; label: string; value: string }[] = [
  { icon: Mail, label: "E-mail", value: "contact@selectagency.example" },
  { icon: Phone, label: "Téléphone", value: "+237 6XX XX XX XX" },
  { icon: MessageCircle, label: "WhatsApp", value: "+237 6XX XX XX XX" },
  { icon: MapPin, label: "Adresse", value: "Douala, Cameroun" },
  { icon: Clock, label: "Horaires", value: "Du lundi au vendredi, de 8 h à 17 h" },
];

const CATEGORY_ICONS: Record<CaseCategory, LucideIcon> = {
  study_abroad: GraduationCap,
  tourist_visa: Plane,
  business_travel: Briefcase,
  administrative_support: Landmark,
  custom_trip: Compass,
  other_mobility: Route,
};

const CATEGORY_IMAGES: Record<CaseCategory, { src: string; alt: string }> = {
  study_abroad: { src: "/images/etudes-etranger.jpg", alt: "Étudiante en mobilité internationale sur campus universitaire" },
  tourist_visa: { src: "/images/visa-tourisme.jpg", alt: "Couple de voyageurs africains à l'aéroport devant la baie vitrée" },
  business_travel: { src: "/images/voyage-affaires.jpg", alt: "Professionnel africain en costume lors d'un déplacement international" },
  custom_trip: { src: "/images/visa-tourisme.jpg", alt: "Voyage sur mesure et départs vers l'international" },
  other_mobility: { src: "/images/voyage-affaires.jpg", alt: "Mobilité professionnelle et démarches d'expatriation" },
  administrative_support: { src: "/images/hero-consultant.jpg", alt: "Conseiller de voyage et accompagnement administratif" },
};

const COVERS = [
  "from-navy-900 via-navy-800 to-navy-600",
  "from-navy-800 via-navy-700 to-navy-500",
  "from-navy-950 via-navy-900 to-navy-700",
];

const KIND_DOTS: Partial<Record<StepKind, string>> = {
  agency_action: "bg-navy-700",
  client_action: "bg-orange-500",
  external_event: "bg-violet-600",
  outcome: "bg-emerald-600",
};

const FEATURES: { icon: LucideIcon; title: string; text: string; soon?: boolean }[] = [
  { icon: Users, title: "Clients", text: "Une fiche unique par client : coordonnées, dossiers, paiements et historique, avec alerte de doublon." },
  { icon: FolderKanban, title: "Dossiers", text: "Des étapes claires qui distinguent ce qui dépend de l'agence, du client ou d'un organisme extérieur." },
  { icon: FileText, title: "Documents", text: "La checklist de chaque dossier : pièces reçues, à vérifier, à corriger ou manquantes." },
  { icon: Wallet, title: "Paiements et reçus", text: "Acomptes et soldes en espèces, Mobile Money ou virement, avec un reçu imprimable pour chaque encaissement." },
  { icon: ListChecks, title: "Tâches", text: "Le travail de chaque membre de l'équipe, les échéances et les retards à rattraper." },
  { icon: UserPlus, title: "Équipe et rôles", text: "Invitez vos collègues par un lien personnel et donnez à chacun le rôle qui correspond à son travail." },
  { icon: LayoutDashboard, title: "Tableau de bord", text: "Les dossiers à traiter, les pièces en attente et les encaissements du moment, dès l'ouverture." },
  { icon: CalendarDays, title: "Rendez-vous", text: "Entretiens, dépôts et échéances au même endroit.", soon: true },
];

const STATS = [
  { value: String(WORKFLOW_TEMPLATES.length), label: "parcours de dossiers prêts à l'emploi" },
  { value: "5", label: "rôles d'équipe, appliqués par la base de données" },
  { value: "3", label: "modes de paiement : espèces, Mobile Money, virement" },
  { value: "10 Mo", label: "par pièce, en PDF ou en photo" },
];

const STEPS = [
  { title: "Créez votre agence", text: "Nom, ville, devise et préfixe des reçus : votre espace est prêt en quelques minutes." },
  { title: "Invitez votre équipe", text: "Un lien personnel valable 7 jours, à transmettre par e-mail ou WhatsApp. Chacun reçoit son rôle." },
  { title: "Suivez chaque dossier", text: "Pièces, étapes et paiements au même endroit, sur téléphone comme sur ordinateur." },
];

const SECURITY = [
  { icon: ShieldCheck, title: "Données cloisonnées", text: "Chaque agence ne voit que ses propres données : la règle est appliquée par la base elle-même." },
  { icon: Lock, title: "Pièces dans un stockage privé", text: "Les documents ne sont jamais publics. Ils s'ouvrent par un lien temporaire." },
  { icon: BadgeCheck, title: "Informations sensibles réservées", text: "Le numéro complet de la pièce d'identité n'est visible que par les responsables et les agents." },
  { icon: Receipt, title: "Reçus sans trou", text: "Chaque reçu reçoit un numéro unique, attribué par la base, sans trou dans la numérotation." },
];

const FAQ = [
  {
    q: "SELECT Agency garantit-il l'obtention d'un visa ?",
    a: "Non. SELECT Agency est un outil de gestion pour votre agence. Les décisions de visa et d'admission relèvent exclusivement des autorités et des établissements concernés.",
  },
  {
    q: "Faut-il installer quelque chose ?",
    a: "Non. SELECT Agency s'utilise dans le navigateur, sur un téléphone Android, un iPhone ou un ordinateur.",
  },
  {
    q: "Une autre agence peut-elle voir mes clients ?",
    a: "Non. Les données sont cloisonnées par agence dans la base de données, et les pièces des clients sont rangées dans un stockage privé.",
  },
  {
    q: "Puis-je envoyer des messages WhatsApp à mes clients ?",
    a: "SELECT Agency prépare le message (pièces manquantes, rappel de rendez-vous, solde à régler). Vous l'envoyez ensuite vous-même depuis WhatsApp, et le message est noté « préparé » dans l'historique du client.",
  },
  {
    q: "Combien coûte SELECT Agency ?",
    a: "Les formules ne sont pas encore fixées : le logiciel est en cours de développement et ouvert aux agences pilotes.",
  },
];

const DEMO_FAQ = {
  q: "Puis-je essayer sans saisir mes propres données ?",
  a: "Oui. À la création de votre compte, vous pouvez ouvrir une agence de démonstration remplie de données fictives, puis la quitter à tout moment.",
};

function SectionIntro({ eyebrow, title, text, className }: { eyebrow: string; title: string; text?: string; className?: string }) {
  return (
    <div className={cn("reveal max-w-2xl", className)}>
      <p className="text-sm font-semibold tracking-wide text-navy-600 uppercase">{eyebrow}</p>
      <SectionTitle className="mt-2 pb-3 text-2xl sm:text-3xl">{title}</SectionTitle>
      {text && <p className="mt-4 text-slate-600">{text}</p>}
    </div>
  );
}

export default function HomePage() {
  const faq = isDemoEnabled() ? [FAQ[0]!, DEMO_FAQ, ...FAQ.slice(1)] : FAQ;

  return (
    <div data-page="accueil" className="min-h-dvh bg-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-navy-900/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="SELECT Agency, accueil" className="shrink-0">
            <Logo priority className="h-8 sm:h-9" />
          </Link>
          <nav aria-label="Sections de la page" className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm text-navy-100 transition hover:bg-white/10 hover:text-white">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button asChild variant="onNavy">
              <Link href="/login">Connexion</Link>
            </Button>
            <Button asChild variant="accent">
              <Link href="/signup">
                <span className="sm:hidden">S&apos;inscrire</span>
                <span className="hidden sm:inline">Créer un compte</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Bannière principale */}
        <section className="relative overflow-hidden bg-linear-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
          {/* Fond d'image d'ambiance agence */}
          <div aria-hidden className="absolute inset-0 z-0 opacity-20 mix-blend-luminosity">
            <img src="/images/hero-consultant.jpg" alt="" className="h-full w-full object-cover object-center filter contrast-125" />
            <div className="absolute inset-0 bg-linear-to-r from-navy-950/95 via-navy-900/85 to-navy-800/80" />
          </div>

          <div aria-hidden className="absolute -top-32 -right-24 size-96 rounded-full bg-navy-500/30 blur-3xl" />
          <div aria-hidden className="absolute -bottom-40 -left-24 size-96 rounded-full bg-citron-400/10 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-28 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:pt-20 lg:pb-36">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-navy-50 motion-safe:animate-rise sm:text-sm">
                <span className="size-1.5 rounded-full bg-citron-400" /> Pour les agences de voyages, de visas et d&apos;études
              </p>
              <h1 className="mt-6 text-4xl leading-tight font-semibold motion-safe:animate-rise sm:text-5xl">
                Chaque dossier client, du premier contact <span className="text-citron-400">jusqu&apos;au départ.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-navy-100 motion-safe:animate-rise motion-safe:[animation-delay:120ms]">
                Clients, dossiers de visa et d&apos;études, pièces, paiements et reçus : SELECT Agency réunit tout le travail de
                votre agence dans un seul outil, pensé pour le téléphone.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 motion-safe:animate-rise motion-safe:[animation-delay:240ms]">
                <Button asChild variant="accent" size="lg" className="group">
                  <Link href="/signup">
                    Créer mon agence
                    <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="onNavy" size="lg" className="border border-white/30">
                  <a href="#fonctionnalites">Voir les fonctionnalités</a>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-100 motion-safe:animate-rise motion-safe:[animation-delay:360ms]">
                <li className="flex items-center gap-2">
                  <Smartphone className="size-4 text-citron-400" aria-hidden /> Téléphone et ordinateur
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-citron-400" aria-hidden /> Données cloisonnées par agence
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-citron-400" aria-hidden /> Ouvert aux agences pilotes
                </li>
              </ul>
            </div>
            <div className="motion-safe:animate-rise motion-safe:[animation-delay:200ms]">
              <HeroPreview />
            </div>
          </div>

          <svg aria-hidden viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full text-white sm:h-24">
            <path fill="currentColor" d="M0 64 C 240 120, 480 120, 720 80 S 1200 0, 1440 48 V 120 H 0 Z" />
          </svg>
        </section>

        {/* Bandeau défilant des types de dossiers */}
        <section aria-label="Types de dossiers pris en charge" className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 sm:-mt-14 sm:px-6">
          <div className="reveal rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-border sm:p-5">
            <p className="text-center text-sm text-slate-500">Un seul outil pour tous vos types de dossiers</p>
            <div className="group mt-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <div className="flex w-max motion-safe:animate-marquee group-hover:[animation-play-state:paused] motion-reduce:w-full">
                {[0, 1].map((copy) => (
                  <ul
                    key={copy}
                    aria-hidden={copy === 1 || undefined}
                    className={cn(
                      "flex shrink-0 gap-3 pr-3 motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:pr-0",
                      copy === 1 && "motion-reduce:hidden",
                    )}
                  >
                    {WORKFLOW_TEMPLATES.map((t) => {
                      const Icon = CATEGORY_ICONS[t.category];
                      return (
                        <li key={t.key} className="flex items-center gap-2 rounded-full border border-navy-100 bg-navy-50 px-4 py-2 text-sm font-medium whitespace-nowrap text-navy-800">
                          <Icon className="size-4 text-navy-600" aria-hidden /> {t.name}
                        </li>
                      );
                    })}
                  </ul>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Parcours prêts à l'emploi */}
        <section id="parcours" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionIntro
              eyebrow="Parcours prêts à l'emploi"
              title="Un modèle d'étapes pour chaque projet"
              text="À la création d'un dossier, ses étapes et sa checklist de pièces sont copiées depuis le modèle choisi. Vous voyez d'un coup d'œil qui doit agir : l'agence, le client ou un organisme."
            />
            <ul className="reveal flex flex-wrap gap-2 text-xs font-medium">
              <li className="flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-navy-800">
                <span className="size-2 rounded-full bg-navy-700" /> Agence
              </li>
              <li className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-orange-800">
                <span className="size-2 rounded-full bg-orange-500" /> Client
              </li>
              <li className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
                <span className="size-2 rounded-full bg-violet-600" /> Organisme extérieur
              </li>
            </ul>
          </div>

          <ul className="reveal -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((template, i) => {
              const Icon = CATEGORY_ICONS[template.category];
              const steps = template.steps.filter((s) => s.kind !== "closure");
              return (
                <li
                  key={template.key}
                  className="group w-[82%] shrink-0 snap-start overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-border transition duration-300 hover:-translate-y-1 hover:ring-2 hover:ring-navy-200 sm:w-[60%] md:w-auto"
                >
                  <div className="relative h-44 overflow-hidden bg-navy-950">
                    <img
                      src={CATEGORY_IMAGES[template.category]?.src || "/images/hero-consultant.jpg"}
                      alt={CATEGORY_IMAGES[template.category]?.alt || template.name}
                      className="h-full w-full object-cover filter brightness-[0.82] contrast-[1.05] transition duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/45 to-transparent" />
                    <span className="absolute bottom-3 left-3 flex size-12 items-center justify-center rounded-xl bg-navy-900/85 text-citron-400 ring-1 ring-white/20 backdrop-blur-md shadow-md">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <span className="absolute top-3 right-3 rounded-full border border-citron-500 bg-citron-400 px-2.5 py-0.5 text-xs font-semibold text-navy-900 tabular-nums shadow-sm">
                      {steps.length} étapes
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-navy-800">{template.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{template.description}</p>
                    <ol className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-slate-700">
                      {steps.slice(0, 3).map((step) => (
                        <li key={step.key} className="flex items-center gap-2.5">
                          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", KIND_DOTS[step.kind])} />
                          <span className="truncate">{step.label}</span>
                        </li>
                      ))}
                      <li className="pl-4.5 text-xs text-slate-500">et {steps.length - 3} autres étapes</li>
                    </ol>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-xs text-slate-500">{WORKFLOW_DISCLAIMER}</p>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="relative scroll-mt-20 overflow-hidden bg-surface py-16 sm:py-24">
          {/* Fond d'image d'ambiance */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-[0.06] mix-blend-multiply">
            <img src="/images/voyage-affaires.jpg" alt="" className="h-full w-full object-cover object-center" />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
            <SectionIntro
              eyebrow="Fonctionnalités"
              title="Tout le travail de l'agence au même endroit"
              text="Fini les cahiers, les tableurs et les pièces éparpillées dans les conversations : chaque membre de l'équipe retrouve la bonne information au bon moment."
            />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className="reveal group flex gap-4 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)] transition duration-300 hover:-translate-y-1 hover:ring-2 hover:ring-navy-200 sm:block sm:p-5"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400 transition duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 font-semibold text-navy-800 sm:mt-4">
                      {f.title}
                      {f.soon && (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Bientôt</span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pensé pour le terrain */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
          <div className="reveal order-2 lg:order-1">
            <PhonePreview />
          </div>
          <div className="order-1 lg:order-2">
            <SectionIntro
              eyebrow="Pensé pour le terrain"
              title="Votre agence dans la poche"
              text="Au guichet, chez un client ou en déplacement : les écrans s'adaptent au téléphone, les boutons sont faits pour le doigt et les listes deviennent des cartes lisibles."
            />
            <ul className="mt-8 grid grid-cols-2 gap-3">
              {STATS.map((s) => (
                <li key={s.label} className="reveal rounded-xl bg-navy-800 p-4 text-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
                  <p className="text-2xl font-semibold text-citron-400 tabular-nums sm:text-3xl">{s.value}</p>
                  <p className="mt-1 text-sm text-navy-100">{s.label}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Démarrage */}
        <section className="relative overflow-hidden bg-surface py-16 sm:py-24">
          {/* Fond d'image d'ambiance */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-[0.06] mix-blend-multiply">
            <img src="/images/etudes-etranger.jpg" alt="" className="h-full w-full object-cover object-center" />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
            <SectionIntro eyebrow="Démarrage" title="Prêt en trois étapes" />
            <ol className="relative mt-10 grid gap-4 lg:grid-cols-3 lg:gap-6">
              <span aria-hidden className="absolute top-8 right-[16%] left-[16%] hidden border-t-2 border-dashed border-navy-200 lg:block" />
              {STEPS.map((step, i) => (
                <li key={step.title} className="reveal relative rounded-xl bg-white p-6 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
                  <span className="flex size-10 items-center justify-center rounded-full border border-citron-500 bg-citron-400 font-semibold text-navy-900 tabular-nums">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-navy-800">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Sécurité */}
        <section id="securite" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <div className="reveal relative overflow-hidden rounded-2xl bg-linear-to-r from-navy-900 via-navy-800 to-navy-600 p-6 text-white sm:p-10 shadow-[0_10px_30px_rgba(2,55,100,0.2)]">
            <div aria-hidden className="absolute inset-0 opacity-15 mix-blend-luminosity">
              <img src="/images/voyage-affaires.jpg" alt="" className="h-full w-full object-cover object-top" />
            </div>
            <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full border border-white/10" />
            <div aria-hidden className="absolute -right-8 -bottom-32 size-72 rounded-full border border-white/10" />
            <div className="relative max-w-2xl">
              <p className="text-sm font-semibold tracking-wide text-citron-400 uppercase">Sécurité et confidentialité</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Les données de vos clients restent les vôtres</h2>
              <p className="mt-4 text-navy-100">
                Passeports, relevés de notes, montants : ce que vos clients vous confient est protégé dès la base de données, pas
                seulement à l&apos;écran.
              </p>
            </div>
            <ul className="relative mt-8 grid gap-4 sm:grid-cols-2">
              {SECURITY.map((s) => (
                <li key={s.title} className="flex gap-4 rounded-xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/10">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-citron-400 text-navy-900">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-navy-100">{s.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Questions fréquentes */}
        <section id="questions" className="relative scroll-mt-20 overflow-hidden bg-surface py-16 sm:py-24">
          {/* Fond d'image d'ambiance */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-[0.06] mix-blend-multiply">
            <img src="/images/hero-consultant.jpg" alt="" className="h-full w-full object-cover object-center" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6">
            <SectionIntro eyebrow="Questions fréquentes" title="Vos questions, nos réponses" />
            <div className="mt-8 space-y-3">
              {faq.map((item) => (
                <details key={item.q} className="reveal group rounded-xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)] open:ring-2 open:ring-navy-200">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-navy-800 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown className="size-5 shrink-0 text-navy-600 transition-transform duration-300 group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-5 pb-5 text-sm text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Contact (coordonnées fictives pour le moment) */}
        <section id="contact" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-24">
          <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
            <div>
              <SectionIntro
                eyebrow="Contact"
                title="Parlons de votre agence"
                text="Une question, une démonstration pour votre équipe ou l'envie de rejoindre les agences pilotes : écrivez-nous ou appelez-nous."
              />
              <div className="reveal mt-6 space-y-5">
                <Notice tone="warning" title="Coordonnées provisoires">
                  Ces coordonnées sont fictives : elles seront remplacées par les vraies avant l&apos;ouverture au public.
                </Notice>
                <PlannedAction label="Demander une démonstration" reason="Formulaire bientôt disponible." icon={Send} />
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {CONTACT.map((c) => (
                <li
                  key={c.label}
                  className="reveal group flex items-start gap-4 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-border transition duration-300 hover:-translate-y-1 hover:ring-2 hover:ring-navy-200 sm:p-5 sm:first:col-span-2"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400 transition duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    <c.icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      {c.label}
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Fictif</span>
                    </p>
                    <p className="mt-1 font-semibold break-words text-navy-800 tabular-nums">{c.value}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Appel à l'action */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="reveal relative overflow-hidden rounded-2xl bg-navy-950 px-6 py-12 text-center text-white shadow-2xl sm:px-12">
            {/* Fond d'image de départ voyage */}
            <div aria-hidden className="absolute inset-0 z-0 opacity-25 mix-blend-luminosity">
              <img src="/images/visa-tourisme.jpg" alt="" className="h-full w-full object-cover object-center filter contrast-125" />
              <div className="absolute inset-0 bg-linear-to-r from-navy-950/95 via-navy-900/80 to-navy-950/95" />
            </div>

            <div aria-hidden className="absolute -top-20 -left-20 size-64 rounded-full bg-navy-600/50 blur-2xl" />
            <div aria-hidden className="absolute -right-16 -bottom-24 size-64 rounded-full bg-citron-400/10 blur-2xl" />
            <div className="relative z-10">
              <h2 className="mx-auto max-w-2xl text-2xl font-semibold sm:text-3xl">
                Prêt à organiser votre agence <span className="text-citron-400">autrement</span> ?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-navy-100">
                Créez votre compte, puis votre agence : vous pourrez inviter votre équipe et enregistrer vos premiers dossiers
                aussitôt.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild variant="accent" size="lg" className="group">
                  <Link href="/signup">
                    Créer mon agence
                    <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="onNavy" size="lg" className="border border-white/30">
                  <Link href="/login">J&apos;ai déjà un compte</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Logo variant="bleu" className="h-9" />
            <p className="mt-3 text-sm text-slate-600">La gestion intelligente des agences de voyages.</p>
          </div>
          <nav aria-label="Liens du pied de page" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="py-1 text-slate-600 hover:text-navy-800">
                {item.label}
              </a>
            ))}
            <Link href="/login" className="py-1 font-medium text-navy-700 hover:underline">
              Se connecter
            </Link>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500 sm:px-6">
          SELECT Agency est un outil de gestion. Il ne garantit l&apos;obtention d&apos;aucun visa ni d&apos;aucune admission : ces
          décisions relèvent exclusivement des autorités et des établissements concernés.
        </p>
      </footer>
    </div>
  );
}
