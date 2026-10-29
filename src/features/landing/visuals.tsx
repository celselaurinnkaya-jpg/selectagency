import { CircleCheck, FileText, GraduationCap, Hourglass, MessageCircle, Plane, Receipt } from "lucide-react";
import { cn } from "cn";

// Illustrations de la page d'accueil, dessinées avec les vrais écrans et libellés de l'application
// (étapes, statuts, reçus). Les noms et montants sont fictifs et signalés comme tels.

const CARD = "rounded-xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]";

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />;
}

/** Aperçu d'un dossier avec photo d'agence professionnelle et cartes SaaS en flottaison. */
export function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden>
      {/* Halo lumineux d'arrière-plan */}
      <div className="absolute -inset-4 rounded-3xl bg-linear-to-r from-citron-400/15 via-navy-400/25 to-navy-600/35 blur-2xl" />

      {/* Cadre photo principal de l'agence */}
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-navy-950 shadow-[0_20px_50px_rgba(2,55,100,0.35)]">
        <div className="relative h-[430px] w-full overflow-hidden sm:h-[470px]">
          <img
            src="/images/hero-consultant.jpg"
            alt="Conseiller d'agence SELECT Agency en entretien avec des clients"
            className="h-full w-full object-cover object-center filter brightness-[0.88] contrast-[1.05] transition duration-700 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/40 to-navy-900/20" />

          {/* Badge guichet en direct */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full border border-white/25 bg-navy-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Guichet actif · Espace Agence</span>
          </div>

          {/* Trajet animé discret */}
          <svg viewBox="0 0 400 460" className="pointer-events-none absolute inset-0 size-full z-10 opacity-60" fill="none">
            <path
              id="trajet"
              d="M10 420 C 90 300, 60 230, 170 210 S 330 170, 390 30"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="6 6"
              className="text-white/40 motion-safe:animate-dash"
            />
            <g className="text-citron-400 motion-reduce:hidden">
              <animateMotion dur="10s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                <mpath href="#trajet" />
              </animateMotion>
              <Plane x={-11} y={-11} width={22} height={22} strokeWidth={2} />
            </g>
          </svg>

          {/* Carte Flottante 1 : Reçu Encaissé */}
          <div className={cn(CARD, "absolute top-4 right-4 z-20 w-44 p-3 shadow-xl ring-1 ring-black/5 motion-safe:animate-float")}>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-citron-400 text-navy-900">
                <Receipt className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500">Reçu <span className="tabular-nums">REC-2026-0042</span></p>
                <p className="text-xs font-semibold text-navy-800 tabular-nums">150 000 XAF</p>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Mobile Money</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">Encaissé</span>
            </div>
          </div>

          {/* Carte Flottante 2 : Message WhatsApp préparé */}
          <div className="absolute top-24 left-4 z-20 hidden items-center gap-2 rounded-full border border-white/20 bg-navy-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md motion-safe:animate-float [animation-delay:-1.5s] sm:flex">
            <MessageCircle className="size-3.5 text-citron-400" /> Message WhatsApp prêt
          </div>

          {/* Carte Flottante Principale : Dossier Études Awa Diallo */}
          <div className={cn(CARD, "absolute inset-x-4 bottom-4 z-20 p-4 text-slate-800 shadow-2xl ring-1 ring-black/10 backdrop-blur-md bg-white/95 sm:inset-x-5 sm:p-5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400 shadow-sm">
                  <GraduationCap className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-800">Awa Diallo</p>
                  <p className="truncate text-xs text-slate-500">
                    <span className="tabular-nums">ETU-2026-0042</span> · Études en France
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                Étape 5 sur 15
              </span>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Avancement</span>
                <span className="font-semibold text-navy-800 tabular-nums">Dépôt Campus France</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-50">
                <div className="h-full w-2/3 origin-left rounded-full bg-linear-to-r from-navy-800 to-navy-600 motion-safe:animate-grow" />
              </div>
            </div>

            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <li className="flex items-center gap-1.5 truncate rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-800">
                <CircleCheck className="size-3.5 shrink-0" />
                <span className="truncate">8 pièces vérifiées</span>
              </li>
              <li className="flex items-center gap-1.5 truncate rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-violet-800">
                <Hourglass className="size-3.5 shrink-0" />
                <span className="truncate">Attente admission</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const PHONE_ROWS = [
  { name: "Ibrahim Sow", detail: "Visa touristique · Espagne", status: "En attente du client", tone: "border-orange-200 bg-orange-50 text-orange-800" },
  { name: "Grâce Mbarga", detail: "Études · Canada", status: "En attente d'un tiers", tone: "border-violet-200 bg-violet-50 text-violet-800" },
  { name: "Koffi Mensah", detail: "Voyage d'affaires · Maroc", status: "Résultat enregistré", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
];

/** Téléphone affichant la liste des dossiers : l'outil est d'abord utilisé sur Android. */
export function PhonePreview() {
  return (
    <div className="relative mx-auto flex h-[440px] w-full max-w-sm items-center justify-center" aria-hidden>
      <div className="absolute size-80 rounded-full bg-navy-50" />
      <div className="absolute size-64 rounded-full border-2 border-dashed border-navy-200 motion-safe:animate-orbit" />

      <div className="relative z-10 w-56 rounded-[2rem] border-[6px] border-navy-900 bg-white p-2 shadow-[0_12px_32px_rgba(2,55,100,0.25)]">
        <div className="rounded-t-[1.4rem] bg-navy-800 px-3 pt-4 pb-3 text-white">
          <p className="text-[10px] text-navy-200">Dossiers actifs · exemple fictif</p>
          <p className="text-sm font-semibold">
            Agence <span className="text-citron-400">Horizon</span>
          </p>
        </div>
        <ul className="space-y-1.5 bg-surface p-2">
          {PHONE_ROWS.map((row) => (
            <li key={row.name} className="rounded-lg bg-white p-2 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
              <p className="text-[11px] font-semibold text-navy-800">{row.name}</p>
              <p className="text-[10px] text-slate-500">{row.detail}</p>
              <span className={cn("mt-1 inline-block rounded-full border px-1.5 py-px text-[9px] font-medium", row.tone)}>{row.status}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-center rounded-b-[1.4rem] bg-surface pb-2">
          <span className="h-1 w-14 rounded-full bg-slate-300" />
        </div>
      </div>

      <div className="absolute top-12 -right-1 z-20 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-[0_1px_3px_rgba(2,55,100,0.15)] motion-safe:animate-float sm:right-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-navy-800 text-citron-400">
          <CircleCheck className="size-4" />
        </span>
        <span className="font-medium text-navy-800">Pièce vérifiée</span>
      </div>
      <div className="absolute bottom-14 -left-1 z-20 rounded-xl bg-navy-800 px-3 py-2 text-xs text-white shadow-[0_1px_3px_rgba(2,55,100,0.3)] motion-safe:animate-float [animation-delay:-3s] sm:left-2">
        <p className="text-navy-200">Solde restant</p>
        <p className="font-semibold text-citron-400 tabular-nums">75 000 XAF</p>
      </div>
    </div>
  );
}
