import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createHmac } from "node:crypto";
import { verifyMetaWebhookSignature } from "./client";
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";

describe("WhatsApp Meta Client — Signature Cryptographique", () => {
  const secret = "test_meta_app_secret_123456";
  const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("valide une signature HMAC SHA-256 correcte", () => {
    const hmac = createHmac("sha256", secret);
    hmac.update(payload, "utf8");
    const sig = `sha256=${hmac.digest("hex")}`;

    const isValid = verifyMetaWebhookSignature(payload, sig, secret);
    expect(isValid).toBe(true);
  });

  it("refuse une signature altérée", () => {
    const fakeSig = "sha256=0000000000000000000000000000000000000000000000000000000000000000";
    const isValid = verifyMetaWebhookSignature(payload, fakeSig, secret);
    expect(isValid).toBe(false);
  });

  it("refuse si le secret est incorrect ou absent", () => {
    const hmac = createHmac("sha256", secret);
    hmac.update(payload, "utf8");
    const sig = `sha256=${hmac.digest("hex")}`;

    expect(verifyMetaWebhookSignature(payload, sig, "wrong_secret")).toBe(false);
    expect(verifyMetaWebhookSignature(payload, null, secret)).toBe(false);
  });
});

describe("Webhook WhatsApp — Vérification GET Challenge", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("répond avec le challenge quand le jeton configuré est donné", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "jeton-de-verification-test");
    const req = new Request("http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=jeton-de-verification-test&hub.challenge=test_challenge_12345");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("test_challenge_12345");
  });

  it("refuse avec un code 403 quand le jeton est faux", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "jeton-de-verification-test");
    const res = await GET(new Request("http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad_token&hub.challenge=x"));
    expect(res.status).toBe(403);
  });

  it("refuse tout tant qu'aucun jeton n'est configuré (pas de jeton par défaut)", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    const res = await GET(new Request("http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=select_agency_wa_token_2026&hub.challenge=x"));
    expect(res.status).toBe(503);
  });
});

describe("Webhook WhatsApp — Réception POST", () => {
  afterEach(() => vi.unstubAllEnvs());
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("refuse tout événement tant que le secret Meta n'est pas configuré", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    vi.stubEnv("CRON_SECRET", "secret-serveur-0123456789abcdef-0123456789");
    const res = await POST(new Request("http://localhost:3000/api/webhooks/whatsapp", { method: "POST", body }));
    expect(res.status).toBe(503);
  });

  it("refuse un événement sans signature valide de Meta", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "test_meta_app_secret_123456");
    vi.stubEnv("CRON_SECRET", "secret-serveur-0123456789abcdef-0123456789");
    const res = await POST(
      new Request("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
