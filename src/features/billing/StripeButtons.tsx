"use client";

import { useState, useTransition } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import type { FormState } from "@/lib/form-state";
import { openCardPortalAction, startCardCheckoutAction } from "./stripe-actions";

// Boutons Stripe de la page Abonnement. En cas de réussite, l'action redirige vers Stripe ; sinon elle renvoie un
// message clair, affiché sous le bouton (jamais une page d'erreur).

export function CardCheckoutButton({ planId, planName }: { planId: string; planName: string }) {
  const [state, setState] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="accent"
        className="w-full"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await startCardCheckoutAction(planId)))}
      >
        <CreditCard aria-hidden />
        {pending ? "Ouverture du paiement…" : `Payer par carte — ${planName}`}
      </Button>
      {state?.message && <FormMessage message={state.message} tone="error" />}
    </div>
  );
}

export function CardPortalButton() {
  const [state, setState] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => setState(await openCardPortalAction()))}>
        <ExternalLink aria-hidden />
        {pending ? "Ouverture…" : "Gérer ma carte et mon abonnement"}
      </Button>
      {state?.message && <FormMessage message={state.message} tone="error" />}
    </div>
  );
}
