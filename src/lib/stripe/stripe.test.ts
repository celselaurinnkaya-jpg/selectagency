import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Faux Stripe : la signature est « valide » seulement si elle vaut « bonne-signature ».
let nextEvent: unknown = null;
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () =>
    process.env.STRIPE_SECRET_KEY
      ? {
          webhooks: {
            constructEvent: (_body: string, signature: string) => {
              if (signature !== "bonne-signature") throw new Error("No signatures found matching the expected signature");
              return nextEvent;
            },
          },
        }
      : null,
}));
vi.mock("@/lib/email/system-worker", () => ({ cronSecret: () => process.env.CRON_SECRET ?? null }));

// Fausse base : enregistre les appels.
const calls: { fn: string; args: Record<string, unknown> }[] = [];
let failNext = false;
vi.mock("@/lib/supabase/system", () => ({
  createSystemClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (failNext) return { data: null, error: { message: "Agence introuvable" } };
      return { data: fn === "stripe_record_invoice" ? "recorded" : true, error: null };
    },
  }),
}));

import { invoiceFacts, organizationFromMetadata, subscriptionPeriodEnd, subscriptionPriceId } from "./events";
import { POST } from "@/app/api/webhooks/stripe/route";

const ORG = "3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f";
const post = (signature: string | null = "bonne-signature") =>
  POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}", headers: signature ? { "stripe-signature": signature } : {} }) as never);

const paidInvoice = {
  id: "in_123",
  customer: "cus_123",
  amount_paid: 15000,
  currency: "xaf",
  number: "SA-0001",
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_123", metadata: { organization_id: ORG } } },
  lines: { data: [{ period: { start: 1_780_000_000, end: 1_782_592_000 }, pricing: { price_details: { price: "price_abc", product: "prod_abc" } } }] },
};

describe("lecture des messages Stripe (src/lib/stripe/events.ts)", () => {
  it("retrouve l'agence, la période payée et le tarif", () => {
    expect(organizationFromMetadata({ organization_id: ORG.toUpperCase() })).toBe(ORG);
    expect(organizationFromMetadata({ organization_id: "pas-un-identifiant" })).toBeNull();
    expect(organizationFromMetadata(null)).toBeNull();
    expect(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1_782_592_000 }, { current_period_end: 1_780_000_000 }] } } as never)).toBe(new Date(1_782_592_000 * 1000).toISOString());
    expect(subscriptionPeriodEnd({ items: { data: [] } } as never)).toBeNull();

    expect(invoiceFacts(paidInvoice as never)).toEqual({
      invoiceId: "in_123",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      priceId: "price_abc",
      amountPaid: 15000,
      currency: "XAF",
      periodEnd: new Date(1_782_592_000 * 1000).toISOString(),
      number: "SA-0001",
      organizationId: ORG,
    });
    expect(invoiceFacts({ ...paidInvoice, parent: null } as never)).toBeNull();

    // Passage de STARTER à PRO facturé aussitôt : avoir sur STARTER (négatif), reste de la période en PRO.
    const upgrade = {
      ...paidInvoice,
      lines: {
        data: [
          { amount: -7500, period: { start: 1, end: 1_782_592_000 }, pricing: { price_details: { price: "price_starter" } } },
          { amount: 15000, period: { start: 1, end: 1_782_592_000 }, pricing: { price_details: { price: "price_pro" } } },
        ],
      },
    };
    expect(invoiceFacts(upgrade as never)?.priceId).toBe("price_pro");
    expect(subscriptionPriceId({ items: { data: [{ price: { id: "price_pro" } }] } } as never)).toBe("price_pro");
    expect(subscriptionPriceId({ items: { data: [] } } as never)).toBeNull();
  });
});

describe("webhook Stripe (src/app/api/webhooks/stripe/route.ts)", () => {
  beforeEach(() => {
    calls.length = 0;
    failNext = false;
    process.env.STRIPE_SECRET_KEY = "sk_test_faux";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_faux";
    process.env.CRON_SECRET = "secret-serveur-0123456789abcdef-0000";
  });

  it("refuse sans configuration, sans signature ou avec une fausse signature", async () => {
    delete process.env.CRON_SECRET;
    expect((await post()).status).toBe(503);
    process.env.CRON_SECRET = "secret-serveur-0123456789abcdef-0000";
    expect((await post(null)).status).toBe(400);
    expect((await post("fausse")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("paiement terminé : relie l'agence notée dans les métadonnées", async () => {
    nextEvent = { type: "checkout.session.completed", data: { object: { mode: "subscription", customer: "cus_123", subscription: "sub_123", metadata: { organization_id: ORG }, client_reference_id: ORG } } };
    expect((await post()).status).toBe(200);
    expect(calls).toEqual([
      { fn: "stripe_link_checkout", args: { p_secret: "secret-serveur-0123456789abcdef-0000", p_organization_id: ORG, p_customer_id: "cus_123", p_subscription_id: "sub_123" } },
    ]);
  });

  it("facture payée : enregistre la facture ; en cas d'erreur, répond 500 pour que Stripe réessaie", async () => {
    nextEvent = { type: "invoice.paid", data: { object: paidInvoice } };
    const ok = await post();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, type: "invoice.paid", result: "recorded" });
    expect(calls[0]).toEqual({
      fn: "stripe_record_invoice",
      args: {
        p_secret: "secret-serveur-0123456789abcdef-0000",
        p_invoice_id: "in_123",
        p_customer_id: "cus_123",
        p_subscription_id: "sub_123",
        p_price_id: "price_abc",
        p_amount_minor: 15000,
        p_currency: "XAF",
        p_period_end: new Date(1_782_592_000 * 1000).toISOString(),
        p_number: "SA-0001",
        p_organization_id: ORG,
      },
    });
    failNext = true;
    const failed = await post();
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("Agence introuvable");
  });

  it("abonnement modifié : statut et fin de période transmis ; autres événements ignorés", async () => {
    nextEvent = { type: "customer.subscription.updated", data: { object: { id: "sub_123", customer: "cus_123", status: "past_due", metadata: { organization_id: ORG }, items: { data: [{ current_period_end: 1_782_592_000, price: { id: "price_pro" } }] } } } };
    expect((await post()).status).toBe(200);
    expect(calls[0]).toEqual({
      fn: "stripe_sync_subscription",
      args: {
        p_secret: "secret-serveur-0123456789abcdef-0000",
        p_subscription_id: "sub_123",
        p_customer_id: "cus_123",
        p_status: "past_due",
        p_period_end: new Date(1_782_592_000 * 1000).toISOString(),
        p_organization_id: ORG,
        p_price_id: "price_pro",
      },
    });
    calls.length = 0;
    nextEvent = { type: "payment_intent.created", data: { object: {} } };
    expect((await post()).status).toBe(200);
    expect(calls).toEqual([]);
  });
});
