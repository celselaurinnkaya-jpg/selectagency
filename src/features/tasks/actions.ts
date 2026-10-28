"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/demo/store";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";

const taskSchema = z.object({
  title: z.string().trim().min(3, "Décrivez la tâche en quelques mots.").max(160),
  assignedTo: z.string().min(1, "Choisissez la personne responsable."),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez une date d'échéance."),
  dueTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  caseId: z.string().optional(),
});

export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = taskSchema.safeParse(values);
  if (!parsed.success) {
    return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const input = parsed.data;
  const data = db();
  if (!data.members.some((m) => m.id === input.assignedTo)) return { message: "Responsable introuvable.", values };
  const travelCase = input.caseId ? data.cases.find((c) => c.id === input.caseId) : undefined;
  if (input.caseId && !travelCase) return { message: "Dossier introuvable.", values };

  data.tasks.push({
    id: crypto.randomUUID(),
    title: input.title,
    assignedTo: input.assignedTo,
    dueAt: localDateTimeToIso(input.dueDate, input.dueTime || "17:00", data.agency.timezone),
    priority: input.priority,
    status: "todo",
    caseId: travelCase?.id,
    clientId: travelCase?.clientId,
  });
  refresh();
  return { ok: true, message: "Tâche ajoutée." };
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  const data = db();
  const task = data.tasks.find((t) => t.id === id);
  if (!task || task.status === "cancelled") return;
  const done = task.status !== "done";
  task.status = done ? "done" : "todo";
  task.completedAt = done ? new Date().toISOString() : undefined;
  refresh();
}
