"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import { activeMembers } from "@/lib/domain/members";

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
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write"), values };
  if (!activeMembers(data.members).some((m) => m.id === input.assignedTo)) return { message: "Responsable introuvable.", values };
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
  if (!allowed(ctx, "operations.write")) return;
  const { data: task } = await ctx.supabase.from("tasks").select("status").eq("id", id).maybeSingle();
  if (!task || task.status === "cancelled") return;
  const done = task.status !== "done";
  await ctx.supabase
    .from("tasks")
    .update({ status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  refresh();
}

/** Supprime les tâches sélectionnées (propriétaire, administrateurs, conseillers : la base le vérifie aussi). */
export async function deleteTasksAction(taskIds: string[]): Promise<FormState> {
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return { message: "Sélectionnez au moins une tâche." };
  if (!ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))) return { message: "Tâche introuvable." };
  // Toute la sélection est supprimée, par paquets (« Tout sélectionner » peut cocher des centaines de tâches).
  if (ids.length > 10000) return { message: "Trop de tâches à la fois : sélectionnez-en 10 000 au plus." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  let count = 0;
  // Par paquets de 100 : la liste des identifiants voyage dans l'adresse de la requête.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await ctx.supabase.from("tasks").delete().eq("organization_id", ctx.organizationId).in("id", ids.slice(i, i + 100)).select("id");
    if (error) {
      if (count > 0) refresh();
      return { message: count > 0 ? `${count} tâche(s) supprimée(s), puis : ${dbMessage(error)}` : dbMessage(error) };
    }
    count += data?.length ?? 0;
  }
  refresh();
  if (count === 0) return { message: "Aucune tâche supprimée : elle n'existe plus, ou vous n'avez pas le droit de la supprimer." };
  const missed = ids.length - count;
  const done = count > 1 ? `${count} tâches supprimées.` : "Tâche supprimée.";
  const notDone = missed > 1 ? `${missed} n'ont pas pu l'être (droits insuffisants ou déjà supprimées).` : "1 n'a pas pu l'être (droits insuffisants ou déjà supprimée).";
  return { ok: true, message: missed > 0 ? `${done} ${notDone}` : done };
}
