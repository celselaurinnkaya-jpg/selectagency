import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Fausse base : enregistre les appels et renvoie des lots d'e-mails à envoyer.
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let batches: Record<string, unknown>[][] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "schedule_system_emails") return { data: { reminders: 2, relances: 1, notices: 0 }, error: null };
      if (fn === "claim_system_emails") return { data: batches.shift() ?? [], error: null };
      return { data: null, error: null };
    },
  }),
}));

// Faux envoi : le deuxième e-mail de chaque lot échoue définitivement.
const delivered: string[] = [];
vi.mock("./deliver", () => ({
  deliverOutboxItem: async (item: { id: string }, loadAttachments: () => Promise<unknown>) => {
    delivered.push(item.id);
    expect(await loadAttachments()).toEqual([]);
    return item.id.endsWith("-2") ? { ok: false, error: "Brevo (400) : adresse invalide", retryable: false } : { ok: true, messageId: `<${item.id}@brevo>`, duplicate: false, sandbox: true };
  },
}));

import { cronSecret, isCronAuthorized, runEmailSchedule } from "./system-worker";

const SECRET = "cron-secret-0123456789abcdef-0123456789";
const row = (id: string) => ({ id, organization_id: "org", kind: "appointment_reminder", idempotency_key: id, recipient_email: "a@b.test", subject: "Rappel", payload: {}, status: "sending", attempts: 1, created_at: new Date().toISOString(), next_attempt_at: new Date().toISOString() });

describe("tâche planifiée des e-mails (src/lib/email/system-worker.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    rpcCalls.length = 0;
    delivered.length = 0;
    batches = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projet-test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.BREVO_API_KEY = "xkeysib-0123456789abcdef0123456789abcdef-secretTestKey999";
    process.env.BREVO_SENDER_EMAIL = "notifications@selectagency.test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exige un secret d'au moins 32 caractères, comparé en temps constant", () => {
    process.env.CRON_SECRET = "trop-court";
    expect(cronSecret()).toBeNull();
    process.env.CRON_SECRET = ` ${SECRET} `;
    expect(cronSecret()).toBe(SECRET);
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(null, SECRET)).toBe(false);
  });

  it("prépare les e-mails du jour, les envoie par lots sans PDF et clôture chacun avec le bon résultat", async () => {
    batches = [Array.from({ length: 25 }, (_, i) => row(`a-${i + 1}`)), [row("b-1"), row("b-2")]];
    const result = await runEmailSchedule(SECRET);

    expect(result).toMatchObject({ prepared: { reminders: 2, relances: 1, notices: 0 }, claimed: 27, sent: 25, failed: 2, stoppedEarly: false });
    expect(delivered).toHaveLength(27);
    expect(rpcCalls[0]).toEqual({ fn: "schedule_system_emails", args: { p_secret: SECRET } });
    // Deux lots réclamés, puis arrêt (le second lot était incomplet).
    expect(rpcCalls.filter((c) => c.fn === "claim_system_emails")).toHaveLength(2);
    const completes = rpcCalls.filter((c) => c.fn === "complete_system_email");
    expect(completes).toHaveLength(27);
    expect(completes.find((c) => c.args.p_email_id === "a-1")!.args).toMatchObject({ p_secret: SECRET, p_success: true, p_brevo_message_id: "<a-1@brevo>", p_permanent: false });
    expect(completes.find((c) => c.args.p_email_id === "b-2")!.args).toMatchObject({ p_success: false, p_brevo_message_id: null, p_error: "Brevo (400) : adresse invalide", p_permanent: true });
  });

  it("s'arrête quand le temps est écoulé ; sans Brevo configuré, ne prépare rien", async () => {
    batches = [Array.from({ length: 25 }, (_, i) => row(`a-${i + 1}`)), [row("b-1")]];
    let clock = 0;
    const result = await runEmailSchedule(SECRET, () => (clock += 30_000));
    expect(result.stoppedEarly).toBe(true);
    expect(result.claimed).toBe(25);

    rpcCalls.length = 0;
    delete process.env.BREVO_API_KEY;
    const idle = await runEmailSchedule(SECRET);
    expect(idle).toMatchObject({ prepared: { reminders: 0, relances: 0, notices: 0 }, claimed: 0 });
    expect(rpcCalls).toEqual([]);
  });
});
