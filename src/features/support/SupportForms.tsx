"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { TICKET_CATEGORY } from "@/lib/domain/labels";
import type { TicketCategory } from "@/lib/domain/types";
import { initialFormState } from "@/lib/form-state";
import { createTicketAction, replyTicketAction } from "./actions";

export function NewTicketForm({ defaultCategory }: { defaultCategory?: TicketCategory }) {
  const [state, action, pending] = useActionState(createTicketAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="ticket-subject" label="Objet" required error={e.subject} className="sm:col-span-2">
          <Input id="ticket-subject" name="subject" defaultValue={v.subject} placeholder="Ex. : Activer la formule annuelle" {...describedBy("ticket-subject", e.subject)} />
        </FormField>
        <FormField id="ticket-category" label="Sujet" required error={e.category}>
          <select id="ticket-category" name="category" defaultValue={v.category ?? defaultCategory ?? "question"} className={selectClass}>
            {(Object.keys(TICKET_CATEGORY) as TicketCategory[]).map((key) => (
              <option key={key} value={key}>
                {TICKET_CATEGORY[key]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField
        id="ticket-body"
        label="Votre message"
        required
        error={e.body}
        hint="N'indiquez jamais de mot de passe ni de code reçu par SMS : l'équipe SELECT ne vous les demandera pas."
      >
        <Textarea id="ticket-body" name="body" rows={5} defaultValue={v.body} {...describedBy("ticket-body", e.body, "hint")} />
      </FormField>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} />
        <Button type="submit" variant="accent" disabled={pending} className="sm:ml-auto">
          <Send aria-hidden />
          {pending ? "Envoi…" : "Envoyer la demande"}
        </Button>
      </div>
    </form>
  );
}

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(replyTicketAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField id="reply-body" label="Répondre" required error={e.body}>
        <Textarea id="reply-body" name="body" rows={4} defaultValue={v.body} {...describedBy("reply-body", e.body)} />
      </FormField>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant="accent" disabled={pending} className="sm:ml-auto">
          <Send aria-hidden />
          {pending ? "Envoi…" : "Envoyer"}
        </Button>
      </div>
    </form>
  );
}
