"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { PRIORITY } from "@/lib/domain/labels";
import { createTaskAction, toggleTaskAction } from "./actions";

export function TaskCreateForm({
  members,
  cases,
  defaultMemberId,
  defaultDate,
  fixedCaseId,
}: {
  members: { value: string; label: string }[];
  cases?: { value: string; label: string }[];
  defaultMemberId: string;
  defaultDate: string;
  fixedCaseId?: string;
}) {
  const [state, action, pending] = useActionState(createTaskAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      {fixedCaseId && <input type="hidden" name="caseId" value={fixedCaseId} />}
      <FormField id="task-title" label="Tâche" required error={e.title} className="sm:col-span-2 lg:col-span-2">
        <Input id="task-title" name="title" defaultValue={v.title} placeholder="Ex. : Relancer le client pour l'assurance" />
      </FormField>
      <FormField id="task-assignee" label="Responsable" required>
        <select id="task-assignee" name="assignedTo" defaultValue={v.assignedTo ?? defaultMemberId} className={selectClass}>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="task-date" label="Échéance" required error={e.dueDate}>
        <Input id="task-date" name="dueDate" type="date" defaultValue={v.dueDate ?? defaultDate} />
      </FormField>
      <FormField id="task-priority" label="Priorité" required>
        <select id="task-priority" name="priority" defaultValue={v.priority ?? "normal"} className={selectClass}>
          {Object.entries(PRIORITY).map(([value, spec]) => (
            <option key={value} value={value}>
              {spec.label}
            </option>
          ))}
        </select>
      </FormField>
      {!fixedCaseId && cases && (
        <FormField id="task-case" label="Dossier lié">
          <select id="task-case" name="caseId" defaultValue={v.caseId ?? ""} className={selectClass}>
            <option value="">Aucun</option>
            {cases.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <div className={cn("flex flex-col gap-2", fixedCaseId ? "" : "sm:col-span-2 lg:col-span-6")}>
        <Button type="submit" variant="accent" disabled={pending} className="sm:self-start">
          {pending ? "Ajout…" : "Ajouter la tâche"}
        </Button>
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </div>
    </form>
  );
}

function ToggleButton({ done, title }: { done: boolean; title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={done ? `Rouvrir la tâche « ${title} »` : `Marquer « ${title} » comme terminée`}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
        done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white hover:border-navy-700",
        pending && "opacity-50",
      )}
    >
      {done && <Check className="size-4" aria-hidden />}
    </button>
  );
}

export function TaskToggle({ taskId, done, title }: { taskId: string; done: boolean; title: string }) {
  return (
    <form action={toggleTaskAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <ToggleButton done={done} title={title} />
    </form>
  );
}
