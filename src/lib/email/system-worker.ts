import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { toEmailOutboxItem } from "@/lib/data/rows";
import { createSystemClient } from "@/lib/supabase/system";
import { emailSendingEnabled } from "./brevo";
import { deliverOutboxItem } from "./deliver";

// Envois planifiés (une fois par jour, Vercel Cron). Aucune personne n'est connectée : l'application appelle la
// base avec la clé publique et le secret de la tâche planifiée, que la base compare à son empreinte SHA-256.
// La tâche ne prend jamais les e-mails qui joignent un PDF (ils partent depuis l'espace de l'agence).

/** Secret de la tâche planifiée (CRON_SECRET), au moins 32 caractères ; null s'il n'est pas configuré. */
export function cronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  return secret.length >= 32 ? secret : null;
}

/** Vérifie l'en-tête « Authorization: Bearer <secret> » envoyé par Vercel Cron, en temps constant. */
export function isCronAuthorized(authorization: string | null, secret: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`));
}

export interface EmailScheduleResult {
  /** E-mails préparés aujourd'hui : rappels de rendez-vous, relances de pièces, alertes d'abonnement. */
  prepared: { reminders: number; relances: number; notices: number };
  claimed: number;
  sent: number;
  failed: number;
  /** Lots non traités faute de temps : ils seront repris au prochain passage. */
  stoppedEarly: boolean;
}

const BATCH_SIZE = 25;
const PARALLEL = 5;
const TIME_BUDGET_MS = 40_000;

/** Prépare les e-mails du jour puis les confie à Brevo, par lots, dans la limite de temps. */
export async function runEmailSchedule(secret: string, now: () => number = Date.now): Promise<EmailScheduleResult> {
  const started = now();
  const db = createSystemClient();
  const result: EmailScheduleResult = { prepared: { reminders: 0, relances: 0, notices: 0 }, claimed: 0, sent: 0, failed: 0, stoppedEarly: false };
  // Sans Brevo configuré, rien n'est préparé : des rappels ne doivent pas s'accumuler pour partir en retard.
  if (!emailSendingEnabled()) return result;

  const { data: prepared, error: scheduleError } = await db.rpc("schedule_system_emails", { p_secret: secret });
  if (scheduleError) throw new Error("Préparation des e-mails du jour impossible.");
  result.prepared = { ...result.prepared, ...(prepared as EmailScheduleResult["prepared"]) };

  while (true) {
    if (now() - started > TIME_BUDGET_MS) {
      result.stoppedEarly = true;
      break;
    }
    const { data: rows, error } = await db.rpc("claim_system_emails", { p_secret: secret, p_limit: BATCH_SIZE });
    if (error) throw new Error("Lecture de la file d'envoi impossible.");
    const items = ((rows ?? []) as Record<string, unknown>[]).map(toEmailOutboxItem);
    if (items.length === 0) break;
    result.claimed += items.length;

    for (let i = 0; i < items.length; i += PARALLEL) {
      await Promise.all(
        items.slice(i, i + PARALLEL).map(async (item) => {
          const res = await deliverOutboxItem(item, async () => []);
          if (res.ok) result.sent += 1;
          else result.failed += 1;
          // Si la clôture échoue, l'e-mail reste « en cours » et sera repris avec la même étiquette anti-doublon.
          await db.rpc("complete_system_email", {
            p_secret: secret,
            p_email_id: item.id,
            p_success: res.ok,
            p_brevo_message_id: res.ok ? res.messageId : null,
            p_error: res.ok ? null : res.error,
            p_permanent: res.ok ? false : !res.retryable,
          });
        }),
      );
    }
    if (items.length < BATCH_SIZE) break;
  }
  return result;
}
