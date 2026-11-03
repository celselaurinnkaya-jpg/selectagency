"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";

// Document préparé pour WhatsApp ou par e-mail : noté dans les communications du client (« préparé,
// envoi manuel »). L'application n'envoie rien elle-même. Faux si le rôle ne note pas les échanges.

export type SharedDocumentKind = "receipt" | "quote" | "case" | "booking";

async function describe(kind: SharedDocumentKind, id: string) {
  const ctx = await getAgencyContext();
  const org = ctx.organizationId;
  if (kind === "receipt") {
    const { data } = await ctx.supabase.from("payments").select("receipt_number, client_id, case_id").eq("id", id).eq("organization_id", org).maybeSingle();
    return { ctx, row: data?.receipt_number ? { client_id: data.client_id, case_id: data.case_id, summary: `Reçu ${data.receipt_number} (PDF)` } : null };
  }
  if (kind === "quote") {
    const { data } = await ctx.supabase.from("quotes").select("reference, client_id, case_id").eq("id", id).eq("organization_id", org).maybeSingle();
    return { ctx, row: data ? { client_id: data.client_id, case_id: data.case_id, summary: `Devis ${data.reference} (PDF)` } : null };
  }
  if (kind === "case") {
    const { data } = await ctx.supabase.from("cases").select("reference, client_id, id").eq("id", id).eq("organization_id", org).maybeSingle();
    return { ctx, row: data ? { client_id: data.client_id, case_id: data.id, summary: `Récapitulatif du dossier ${data.reference} (PDF)` } : null };
  }
  const { data } = await ctx.supabase.from("service_bookings").select("number, service_client_id").eq("id", id).eq("organization_id", org).maybeSingle();
  if (!data) return { ctx, row: null };
  const { data: link } = await ctx.supabase.from("service_clients").select("client_id, case_id").eq("id", data.service_client_id).maybeSingle();
  return { ctx, row: link ? { client_id: link.client_id, case_id: link.case_id, summary: `Confirmation de réservation ${data.number} (PDF)` } : null };
}

export async function logDocumentSharedAction(kind: SharedDocumentKind, id: string, channel: "whatsapp" | "email"): Promise<boolean> {
  if (!z.uuid().safeParse(id).success || !["receipt", "quote", "case", "booking"].includes(kind)) return false;
  const { ctx, row } = await describe(kind, id);
  if (!row || !allowed(ctx, "operations.write")) return false;
  const { error } = await ctx.supabase.from("communication_logs").insert({
    organization_id: ctx.organizationId,
    client_id: row.client_id,
    case_id: row.case_id,
    channel,
    status: "prepared_manual",
    summary: row.summary,
    actor_id: ctx.member.id,
  });
  if (error) return false;
  refresh();
  return true;
}
