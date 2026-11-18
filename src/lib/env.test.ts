import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_URL, isLocalUrl, siteUrl } from "./env";

// Adresse des liens transmis (invitations, e-mails) : jamais « localhost » dans la version en ligne.

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("prend le vrai domaine quand la variable est absente", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
  });

  it("garde l'adresse configurée, sans barre finale", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.myselectagency.com/");
    expect(siteUrl()).toBe("https://www.myselectagency.com");
  });

  it("garde localhost en développement", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("ignore une adresse locale dans la version en ligne", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const local of ["http://localhost:3000", "http://127.0.0.1:3000/", "http://0.0.0.0:3000"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", local);
      expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    }
  });
});

describe("isLocalUrl", () => {
  it("reconnaît les adresses locales", () => {
    expect(isLocalUrl("http://localhost:3000/invite/abc")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1/")).toBe(true);
    expect(isLocalUrl("http://[::1]:3000/")).toBe(true);
  });

  it("laisse passer le vrai domaine et les valeurs invalides", () => {
    expect(isLocalUrl("https://www.myselectagency.com/invite/abc")).toBe(false);
    expect(isLocalUrl("https://localhost.example.com/")).toBe(false);
    expect(isLocalUrl("pas une adresse")).toBe(false);
  });
});
