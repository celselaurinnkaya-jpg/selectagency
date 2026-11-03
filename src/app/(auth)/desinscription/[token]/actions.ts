"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface UnsubscribeResult {
  ok: boolean;
  firstName?: string;
  agencyName?: string;
  unsubscribed?: boolean;
  error?: string;
}

export async function toggleClientEmailSubscriptionAction(token: string, resubscribe = false): Promise<UnsubscribeResult> {
  if (!z.uuid().safeParse(token).success) {
    return { ok: false, error: "Lien de désinscription invalide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_client_email", {
    p_token: token,
    p_resubscribe: resubscribe,
  });

  if (error || !data) {
    return { ok: false, error: "Lien de désinscription introuvable ou expiré." };
  }

  const row = data as { first_name?: string; agency_name?: string; unsubscribed?: boolean };
  return {
    ok: true,
    firstName: row.first_name ?? "",
    agencyName: row.agency_name ?? "SELECT Agency",
    unsubscribed: Boolean(row.unsubscribed),
  };
}

