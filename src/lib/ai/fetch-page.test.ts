import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { htmlToText, isPublicIp, readPublicPage } from "./fetch-page";

describe("isPublicIp", () => {
  it("accepte les adresses publiques, en IPv4 et en IPv6", () => {
    for (const ip of ["8.8.8.8", "41.202.219.1", "2001:4860:4860::8888", "2a00:1450:4007:80e::200e", "::ffff:8.8.8.8", "::ffff:808:808"]) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });

  it("refuse les adresses internes, même déguisées en IPv6", () => {
    for (const ip of [
      "127.0.0.1",
      "169.254.169.254",
      "10.1.2.3",
      "::1",
      "::",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "::a9fe:a9fe",
      "64:ff9b::7f00:1",
      "2002:7f00:1::",
      "2001::1",
      "fe80::1",
      "fc00::1",
      "ff02::1",
      "pas-une-ip",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
});

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
    for (const url of [
      "http://127.0.0.1/",
      "http://localhost:3000/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://10.0.0.5/",
      "ftp://exemple.com/",
      // Adresses internes déguisées en IPv6 (revue de sécurité du 27/11).
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:a9fe:a9fe]/",
      "http://[::ffff:7f00:1]/",
      "http://[::127.0.0.1]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      "http://[2002:a9fe:a9fe::1]/",
      "http://[2001:0:4136:e378::1]/",
      "http://[fe80::1]/",
      "http://[fd00::1]/",
      "http://[::]/",
    ]) {
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
