import "server-only";
import type { AgencyContext } from "@/lib/auth/context";
import type { FormState } from "@/lib/form-state";

/**
 * Résultat réel d'un envoi demandé par l'agent, lu dans la file d'envoi après la tentative :
 * « accepté par Brevo » (jamais « livré » : la livraison vient plus tard), en file d'attente, ou échec avec sa raison.
 */
export async function outboxResultMessage(ctx: AgencyContext, outboxId: string, title: string, to: string): Promise<FormState> {
  const { data: row } = await ctx.supabase.from("email_outbox").select("status, last_error").eq("id", outboxId).maybeSingle();
  const status = row?.status as string | undefined;
  if (status === "sent" || status === "delivered") {
    return { ok: true, message: `${title} envoyé à ${to}. Brevo l'a accepté ; la livraison s'affichera dans l'historique du client.` };
  }
  if (status === "queued" || status === "sending") {
    return { ok: true, message: `${title} est en file d'envoi pour ${to} : il partira au prochain essai.` };
  }
  return { message: `L'envoi a échoué${row?.last_error ? ` : ${row.last_error}` : "."}` };
}
