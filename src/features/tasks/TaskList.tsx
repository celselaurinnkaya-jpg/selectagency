"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { Card } from "@/components/shared/ui";
import { initialFormState, type FormState } from "@/lib/form-state";
import { deleteTasksAction } from "./actions";

// Liste des tâches avec sélection : la coche verte (à gauche) termine la tâche ; la case de sélection (à droite,
// à côté de la corbeille) sert à supprimer une ou plusieurs tâches d'un coup, après confirmation.

export interface TaskListItem {
  id: string;
  title: string;
  /** Coche « terminer » (absente en lecture seule). */
  toggle?: ReactNode;
  body: ReactNode;
  badge?: ReactNode;
}

const confirmText = (count: number, title: string) =>
  count > 1 ? `Supprimer ces ${count} tâches ? Elles disparaîtront définitivement.` : `Supprimer la tâche « ${title} » ? Elle disparaîtra définitivement.`;

export function TaskList({ items, canDelete }: { items: TaskListItem[]; canDelete: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  const present = new Set(items.map((t) => t.id));
  const chosen = selected.filter((id) => present.has(id));
  const allChosen = items.length > 0 && chosen.length === items.length;

  const remove = (ids: string[]) => {
    if (ids.length === 0) return;
    const title = items.find((t) => t.id === ids[0])?.title ?? "";
    if (!confirm(confirmText(ids.length, title))) return;
    start(async () => {
      const result = await deleteTasksAction(ids);
      setState(result);
      if (result.ok) setSelected((current) => current.filter((id) => !ids.includes(id)));
    });
  };
  const toggle = (id: string, on: boolean) => setSelected((current) => (on ? [...current, id] : current.filter((x) => x !== id)));

  return (
    <div className="space-y-2">
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      {canDelete && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-1.5 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
          {chosen.length > 0 && <span className="text-sm text-slate-600">{chosen.length > 1 ? `${chosen.length} tâches sélectionnées` : "1 tâche sélectionnée"}</span>}
          <Button type="button" size="sm" variant="outline" className="text-red-700" disabled={chosen.length === 0 || pending} onClick={() => remove(chosen)}>
            <Trash2 className="size-4" aria-hidden />
            {pending ? "Suppression…" : "Supprimer la sélection"}
          </Button>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            Tout sélectionner
            <input
              type="checkbox"
              checked={allChosen}
              onChange={(event) => setSelected(event.target.checked ? items.map((t) => t.id) : [])}
              className="size-4 accent-navy-800"
            />
          </label>
        </div>
      )}
      <ul className="space-y-2">
        {items.map((task) => {
          const checked = chosen.includes(task.id);
          return (
            <li key={task.id}>
              <Card className={cn("flex items-start gap-3", checked && "ring-2 ring-navy-300")}>
                {task.toggle}
                <div className="min-w-0 flex-1">{task.body}</div>
                {task.badge}
                {canDelete && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-700"
                      disabled={pending}
                      onClick={() => remove([task.id])}
                      aria-label={`Supprimer la tâche « ${task.title} »`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Supprimer</span>
                    </Button>
                    <label className="flex size-10 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggle(task.id, event.target.checked)}
                        aria-label={`Sélectionner la tâche « ${task.title} »`}
                        className="size-4 accent-navy-800"
                      />
                    </label>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
