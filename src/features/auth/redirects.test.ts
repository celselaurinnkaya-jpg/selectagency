import { describe, expect, it } from "vitest";
import { safeNext } from "./redirects";

describe("safeNext", () => {
  it("garde les chemins internes, avec leurs paramètres", () => {
    expect(safeNext("/clients")).toBe("/clients");
    expect(safeNext("/invite/3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f")).toBe("/invite/3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f");
    expect(safeNext("/tasks?vue=terminees&qui=moi")).toBe("/tasks?vue=terminees&qui=moi");
    expect(safeNext("/site-web/messages#liste")).toBe("/site-web/messages#liste");
  });

  it("refuse toute adresse qui quitterait le site", () => {
    for (const next of [
      "https://exemple.com",
      "//exemple.com",
      "/\\exemple.com",
      "/\t/exemple.com",
      "/\n/exemple.com",
      "/\r/exemple.com",
      "\t//exemple.com",
      "/%09/exemple.com/../x\\y",
      "javascript:alert(1)",
      "clients",
      "",
    ]) {
      expect(safeNext(next, "/dashboard")).toBe("/dashboard");
    }
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined, "/onboarding")).toBe("/onboarding");
  });

  it("laisse encodé ce qui l'est : « %09 » reste un texte dans le chemin, sans quitter le site", () => {
    expect(safeNext("/%09/exemple.com")).toBe("/%09/exemple.com");
    expect(new URL(safeNext("/%09/exemple.com"), "https://www.myselectagency.com").host).toBe("www.myselectagency.com");
  });
});
