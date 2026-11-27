"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { setWebsiteMessageHandledAction } from "./actions";

/** « Marquer comme traité » (ou « Remettre à traiter ») sur un message reçu par le site. */
export function MessageHandledButton({ messageId, handled }: { messageId: string; handled: boolean }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant={handled ? "outline" : "accent"}
        disabled={pending}
        onClick={() => start(async () => setState(await setWebsiteMessageHandledAction(messageId, !handled)))}
      >
        {pending ? "…" : handled ? "Remettre à traiter" : "Marquer comme traité"}
      </Button>
      {!state.ok && <FormMessage message={state.message} />}
    </div>
  );
}
