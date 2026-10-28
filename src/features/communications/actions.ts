"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/demo/store";

/**
 * Journalise un message WhatsApp préparé. L'envoi reste manuel : l'agent l'envoie lui-même
 * depuis WhatsApp. Le journal indique donc « préparé », jamais « envoyé » ni « délivré ».
 */
export async function logPreparedMessageAction(input: { clientId: string; caseId?: string; summary: string }): Promise<void> {
  const data = db();
  const client = data.clients.find((c) => c.id === input.clientId);
  if (!client) return;
  if (input.caseId && !data.cases.some((c) => c.id === input.caseId && c.clientId === client.id)) return;
  data.communications.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    clientId: client.id,
    caseId: input.caseId,
    channel: "whatsapp",
    status: "prepared_manual",
    summary: input.summary.slice(0, 200),
    actorId: data.currentMemberId,
  });
  refresh();
}
