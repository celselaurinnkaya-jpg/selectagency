import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { htmlToText, readPublicPage } from "./fetch-page";

describe("htmlToText", () => {
  it("garde le titre, la description et le texte visible, sans scripts ni styles", () => {
    const html = `<html><head><title>Agence Horizon &amp; Voyages</title>
      <meta name="description" content="Visas, études et billets d&#39;avion">
      <style>.x{color:red}</style><script>alert("non")</script></head>
      <body><header>Menu</header><h1>Nos services</h1><p>Accompagnement Campus France</p><!-- note --></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe("Agence Horizon & Voyages");
    expect(text).toContain("Visas, études et billets d'avion");
    expect(text).toContain("Menu");
    expect(text).toContain("Nos services");
    expect(text).toContain("Accompagnement Campus France");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("note");
  });
});

describe("readPublicPage", () => {
  it("refuse les adresses internes et les protocoles autres que http et https, sans rien appeler", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const url of ["http://127.0.0.1/", "http://localhost:3000/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://10.0.0.5/", "ftp://exemple.com/"]) {
      const result = await readPublicPage(url);
      expect(result.ok, url).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuse une adresse mal écrite", async () => {
    const result = await readPublicPage("pas une adresse");
    expect(result).toEqual({ ok: false, error: "Adresse invalide : elle doit commencer par https://" });
  });
});
