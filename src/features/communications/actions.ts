"use server";

import { refresh } from "next/cache";
import { getAgencyContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";

/**
 * Journalise un message WhatsApp préparé. L'envoi reste manuel : l'agent l'envoie lui-même
 * depuis WhatsApp. Le journal indique donc « préparé », jamais « envoyé » ni « délivré ».
 */
export async function logPreparedMessageAction(input: { clientId: string; caseId?: string; summary: string }): Promise<void> {
  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "operations.write")) return;
  const { data: client } = await ctx.supabase.from("clients").select("id").eq("id", input.clientId).maybeSingle();
  if (!client) return;
  if (input.caseId) {
    const { data: travelCase } = await ctx.supabase.from("cases").select("id").eq("id", input.caseId).eq("client_id", input.clientId).maybeSingle();
    if (!travelCase) return;
  }
  await ctx.supabase.from("communication_logs").insert({
    organization_id: ctx.organizationId,
    client_id: input.clientId,
    case_id: input.caseId ?? null,
    channel: "whatsapp",
    status: "prepared_manual",
    summary: input.summary.slice(0, 200) || "Message préparé",
    actor_id: ctx.member.id,
  });
  refresh();
}
