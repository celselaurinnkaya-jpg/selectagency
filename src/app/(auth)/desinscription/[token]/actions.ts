"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface UnsubscribeResult {
  ok: boolean;
  firstName?: string;
  agencyName?: string;
  unsubscribed?: boolean;
  /**
   * Code de réinscription à usage unique, remis à la personne qui vient de se désinscrire (l'agence ne le voit
   * jamais : la base n'en garde que l'empreinte). Il reste dans la page, jamais dans l'adresse ni les journaux.
   */
  resubscribeCode?: string;
  error?: string;
}

export async function toggleClientEmailSubscriptionAction(token: string, resubscribe = false, resubscribeCode?: string): Promise<UnsubscribeResult> {
  if (!z.uuid().safeParse(token).success) {
    return { ok: false, error: "Lien de désinscription invalide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_client_email", {
    p_token: token,
    p_resubscribe: resubscribe,
    p_resubscribe_code: resubscribe ? (resubscribeCode ?? null) : null,
  });

  if (error || !data) {
    return {
      ok: false,
      error: resubscribe
        ? "La réinscription n'est possible que juste après la désinscription, depuis la même page."
        : "Lien de désinscription introuvable ou expiré.",
    };
  }

  const row = data as { first_name?: string; agency_name?: string; unsubscribed?: boolean; resubscribe_code?: string | null };
  return {
    ok: true,
    firstName: row.first_name ?? "",
    agencyName: row.agency_name ?? "SELECT Agency",
    unsubscribed: Boolean(row.unsubscribed),
    resubscribeCode: row.resubscribe_code ?? undefined,
  };
}
