"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { acceptPartnerAccessAction } from "./actions";

/** Le partenaire, connecté avec la bonne adresse, ouvre son espace. */
export function AcceptPartnerAccess({ token }: { token: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="space-y-2">
      <FormMessage message={state.message} />
      <Button
        type="button"
        variant="accent"
        disabled={pending || leaving}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptPartnerAccessAction(token);
            if (result.ok && result.redirectTo) {
              setLeaving(true);
              window.location.assign(result.redirectTo);
            } else setState(result);
          })
        }
      >
        {pending || leaving ? "Un instant…" : "Ouvrir mon espace partenaire"}
      </Button>
    </div>
  );
}
