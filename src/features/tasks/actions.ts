"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { can, FORBIDDEN_MESSAGE } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
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
  const { data, ctx } = await readAgency(input.caseId ? { cases: (q) => q.eq("id", input.caseId!) } : {});
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE, values };
  if (!data.members.some((m) => m.id === input.assignedTo)) return { message: "Responsable introuvable.", values };
  const travelCase = data.cases[0];
  if (input.caseId && !travelCase) return { message: "Dossier introuvable.", values };

  const { error } = await ctx.supabase.from("tasks").insert({
    organization_id: ctx.organizationId,
    title: input.title,
    assigned_to: input.assignedTo,
    due_at: localDateTimeToIso(input.dueDate, input.dueTime || "17:00", data.agency.timezone),
    priority: input.priority,
    status: "todo",
    case_id: travelCase?.id ?? null,
    client_id: travelCase?.clientId ?? null,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Tâche ajoutée." };
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const id = String(formData.get("taskId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "operations.write")) return;
  const { data: task } = await ctx.supabase.from("tasks").select("status").eq("id", id).maybeSingle();
  if (!task || task.status === "cancelled") return;
  const done = task.status !== "done";
  await ctx.supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  refresh();
}
