import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { FEATURE_LABEL, type Feature } from "@/lib/domain/features";

// Option non incluse dans la formule de l'agence (STARTER) : explication et lien vers la page Abonnement.
// La base refuse de toute façon d'y créer des données (private.org_has_feature).

/** Petit badge « PRO » posé à côté d'une option réservée. */
export function ProBadge({ onNavy = false, className }: { onNavy?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-semibold tracking-wide",
        onNavy ? "border-citron-500 bg-citron-400 text-navy-900" : "border-navy-200 bg-navy-50 text-navy-800",
        className,
      )}
    >
      <Lock className="size-2.5" aria-hidden />
      PRO
    </span>
  );
}

/** Encadré affiché en haut d'une page dont l'option n'est pas incluse dans la formule. */
export function FeatureLocked({ feature, children }: { feature: Feature; children?: React.ReactNode }) {
  return (
    <div role="note" className="flex flex-col gap-3 rounded-xl border border-navy-200 bg-navy-50 px-4 py-4 text-sm text-navy-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-navy-800 text-citron-400">
          <Lock className="size-4" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">
            {FEATURE_LABEL[feature]} : option incluse dans les formules PRO et BUSINESS
          </p>
          <p className="mt-0.5 text-navy-800">
            {children ?? "Votre formule STARTER permet de consulter ce qui existe déjà, mais pas d'en créer de nouveaux."}
          </p>
        </div>
      </div>
      <Button asChild variant="accent" className="shrink-0">
        <Link href="/settings/billing">
          <Sparkles aria-hidden />
          Passez à PRO
        </Link>
      </Button>
    </div>
  );
}
