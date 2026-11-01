import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "cn";
import { can } from "@/lib/auth/permissions";
import { daysLeft, effectiveStatus } from "@/lib/domain/subscription";
import { formatDate } from "@/lib/format";
import { getShell } from "@/features/operations/queries";

// Bandeau de l'abonnement : fin d'essai proche, essai terminé, retard de paiement, suspension.
// Rien n'est affiché quand tout va bien (abonnement actif, essai qui court encore longtemps).

const TRIAL_WARNING_DAYS = 7;

export async function SubscriptionBanner() {
  const { subscription, isDemo, member, agency } = await getShell();
  if (isDemo || !subscription) return null;
  const now = new Date();
  const status = effectiveStatus(subscription, now);
  const owner = can(member.role, "billing.read");

  let message: React.ReactNode = null;
  let severe = false;
  if (status === "trialing" && subscription.trialEndsAt && daysLeft(subscription.trialEndsAt, now) <= TRIAL_WARNING_DAYS) {
    const days = daysLeft(subscription.trialEndsAt, now);
    message = (
      <>
        <strong>Essai gratuit :</strong> {days <= 1 ? "dernier jour" : `plus que ${days} jours`} (jusqu&apos;au {formatDate(subscription.trialEndsAt, agency.timezone)}).
        Ensuite, l&apos;agence passera en lecture seule jusqu&apos;à l&apos;activation de l&apos;abonnement.
      </>
    );
  } else if (status === "trial_expired") {
    severe = true;
    message = (
      <>
        <strong>Essai terminé :</strong> l&apos;agence est en lecture seule. Vos données restent consultables ; activez l&apos;abonnement pour
        enregistrer à nouveau.
      </>
    );
  } else if (status === "past_due") {
    message = (
      <>
        <strong>Paiement de l&apos;abonnement en retard.</strong> L&apos;agence fonctionne normalement pour le moment ; réglez l&apos;échéance pour
        éviter une suspension.
      </>
    );
  } else if (status === "suspended" || status === "cancelled") {
    severe = true;
    message = (
      <>
        <strong>{status === "suspended" ? "Abonnement suspendu" : "Abonnement résilié"} :</strong> l&apos;agence est en lecture seule. Vos données
        restent consultables.
      </>
    );
  }
  if (!message) return null;

  const Icon = severe ? AlertTriangle : Clock;
  return (
    <div role="status" className={cn("border-b px-4 py-2 print:hidden", severe ? "border-red-200 bg-red-50 text-red-900" : "border-orange-200 bg-orange-50 text-orange-900")}>
      <div className="mx-auto flex max-w-6xl flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-center sm:gap-4">
        <p className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </p>
        {owner ? (
          <Link href="/settings/billing" className="min-h-9 shrink-0 pl-6 font-medium underline underline-offset-2 sm:pl-0">
            Voir l&apos;abonnement
          </Link>
        ) : (
          <span className="shrink-0 pl-6 text-xs sm:pl-0">Prévenez le propriétaire de l&apos;agence.</span>
        )}
      </div>
    </div>
  );
}
