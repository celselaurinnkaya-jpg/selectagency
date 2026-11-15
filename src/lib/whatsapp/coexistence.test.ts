import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { accountAccessToken, echoMessages, historyMessages, messageContent, syncedContacts } from "./coexistence";
import { exchangeCode, findPhone, findWabaId, HISTORY_DECLINED, MetaError, requestSync, subscribeApp } from "./meta-signup";
import { decryptToken, encryptToken } from "./token-crypto";

const SECRET = "secret-serveur-0123456789abcdef-0123456789";

describe("historyMessages (historique du téléphone)", () => {
  it("classe les messages reçus et envoyés, et garde l'heure de Meta", () => {
    const value = {
      history: [
        {
          threads: [
            {
              id: "242061112233",
              context: { wa_id: "242061112233" },
              messages: [
                { from: "242061112233", id: "wamid.1", timestamp: "1762000000", type: "text", text: { body: "Bonjour, le visa ?" } },
                { from: "242069998877", id: "wamid.2", timestamp: "1762000060", type: "text", text: { body: "Oui, passez à l'agence." } },
                { from: "242061112233", id: "wamid.3", timestamp: "1762000120", type: "image", image: {} },
                { from: "242061112233", id: "wamid.4", timestamp: "1762000180", type: "unsupported" },
              ],
            },
          ],
        },
      ],
    };
    expect(historyMessages(value)).toEqual([
      { contactWaId: "242061112233", direction: "inbound", metaMessageId: "wamid.1", kind: "text", text: "Bonjour, le visa ?", timestamp: new Date(1762000000 * 1000).toISOString() },
      { contactWaId: "242061112233", direction: "outbound", metaMessageId: "wamid.2", kind: "text", text: "Oui, passez à l'agence.", timestamp: new Date(1762000060 * 1000).toISOString() },
      { contactWaId: "242061112233", direction: "inbound", metaMessageId: "wamid.3", kind: "image", text: "📷 Photo", timestamp: new Date(1762000120 * 1000).toISOString() },
    ]);
  });

  it("lit les messages envoyés depuis le téléphone et les contacts du téléphone", () => {
    expect(echoMessages({ message_echoes: [{ to: "242061112233", id: "wamid.9", timestamp: "1762000300", type: "text", text: { body: "Je vous rappelle." } }] })).toEqual([
      { contactWaId: "242061112233", direction: "outbound", metaMessageId: "wamid.9", kind: "text", text: "Je vous rappelle.", timestamp: new Date(1762000300 * 1000).toISOString() },
    ]);
    expect(
      syncedContacts({
        state_sync: [
          { type: "contact", action: "add", contact: { full_name: "Awa Mbemba", phone_number: "+242 06 111 22 33" } },
          { type: "contact", action: "remove", contact: { full_name: "Ancien", phone_number: "+242 06 000 00 00" } },
        ],
      }),
    ).toEqual([{ waId: "242061112233", name: "Awa Mbemba" }]);
    expect(messageContent({ type: "document", document: { filename: "passeport.pdf" } })).toEqual({ kind: "document", text: "📄 passeport.pdf" });
  });
});

describe("jeton du numéro", () => {
  it("est chiffré (illisible dans la base) et se relit avec le secret serveur seulement", () => {
    const sealed = encryptToken("EAAG-jeton-meta", SECRET);
    expect(sealed).not.toContain("EAAG");
    expect(decryptToken(sealed, SECRET)).toBe("EAAG-jeton-meta");
    expect(decryptToken(sealed, "un-autre-secret-0123456789abcdef-00000")).toBeNull();
  });

  it("est retrouvé pour un numéro, sinon on revient au jeton système", async () => {
    const sealed = encryptToken("EAAG-jeton-meta", SECRET);
    expect(await accountAccessToken(async () => ({ data: sealed, error: null }), SECRET, "123456")).toBe("EAAG-jeton-meta");
    vi.stubEnv("WHATSAPP_SYSTEM_ACCESS_TOKEN", "");
    expect(await accountAccessToken(async () => ({ data: null, error: null }), SECRET, "123456")).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("appels à Meta après le scan", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it("échange le code, trouve le numéro, abonne le webhook et demande l'historique", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (u.includes("/oauth/access_token")) return ok({ access_token: "EAAG-jeton", token_type: "bearer" });
      if (u.includes("/phone_numbers")) return ok({ data: [{ id: "555000", display_phone_number: "+242 06 400 99 99", verified_name: "Agence" }] });
      return ok({ success: true });
    }) as typeof fetch;

    expect(await exchangeCode(fake, "APPID", "APPSECRET", "CODE")).toBe("EAAG-jeton");
    expect(calls[0]!.url).toContain("client_id=APPID");
    expect(calls[0]!.url).toContain("code=CODE");
    expect(await findPhone(fake, "EAAG-jeton", "777000")).toEqual({ id: "555000", displayPhoneNumber: "+242 06 400 99 99", verifiedName: "Agence" });
    await subscribeApp(fake, "EAAG-jeton", "777000");
    expect(calls.at(-1)).toMatchObject({ method: "POST" });
    expect(calls.at(-1)!.url).toContain("/777000/subscribed_apps");
    await requestSync(fake, "EAAG-jeton", "555000", "history");
    expect(calls.at(-1)!.url).toContain("/555000/smb_app_data");
    expect(JSON.parse(calls.at(-1)!.body!)).toEqual({ messaging_product: "whatsapp", sync_type: "history" });
  });

  it("retrouve le compte WhatsApp Business relié quand la fenêtre Meta ne l'a pas transmis", async () => {
    let asked = "";
    const fake = (async (url: string | URL | Request) => {
      asked = String(url);
      return ok({
        data: {
          granular_scopes: [
            { scope: "business_management", target_ids: ["111"] },
            { scope: "whatsapp_business_management", target_ids: ["777000", "666000"] },
          ],
        },
      });
    }) as typeof fetch;
    expect(await findWabaId(fake, "APPID", "APPSECRET", "EAAG-jeton")).toEqual({
      wabaId: "777000",
      scopes: ["business_management", "whatsapp_business_management"],
    });
    expect(asked).toContain("/debug_token?");
    expect(asked).toContain("input_token=EAAG-jeton");
    // Configuration Meta sans WhatsApp : aucun compte, et les autorisations reçues expliquent pourquoi.
    const none = (async () =>
      ok({ data: { scopes: ["business_management", "public_profile"], granular_scopes: [{ scope: "business_management", target_ids: ["111"] }] } })) as typeof fetch;
    expect(await findWabaId(none, "APPID", "APPSECRET", "EAAG-jeton")).toEqual({ wabaId: undefined, scopes: ["business_management", "public_profile"] });
  });

  it("transmet l'erreur de Meta (ex. historique refusé par l'agence)", async () => {
    const refused = (async () =>
      new Response(JSON.stringify({ error: { message: "History sharing declined", code: HISTORY_DECLINED } }), { status: 400 })) as typeof fetch;
    const error = await requestSync(refused, "EAAG-jeton", "555000", "history").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaError);
    expect((error as MetaError).code).toBe(HISTORY_DECLINED);
  });
});
