import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { DocumentSpec } from "./spec";
import { renderSpecPdf } from "./spec-pdf";

vi.mock("server-only", () => ({}));

const base: DocumentSpec = {
  title: "RÉCAPITULATIF DE DOSSIER",
  numberLabel: "Dossier",
  number: "DOS-2026-00001",
  issuerTitle: "Agence",
  issuer: { name: "Agence Étoile SARL", lines: ["Akwa, Douala", "NIU M0123"] },
  recipientTitle: "Client",
  recipient: { name: "Awa Diallo", lines: ["Bonamoussadi, Douala"] },
  facts: [
    { label: "Démarche", value: "Master Lyon — Études en France — Campus France" },
    { label: "Destination", value: "France" },
    { label: "Ouvert le", value: "01/11/2026" },
  ],
  sections: [
    { kind: "checklist", title: "Étapes", items: [{ label: "Nouveau candidat", state: "done", detail: "Fait le 01/11/2026" }, { label: "Entretien pédagogique", state: "current" }, { label: "Visa", state: "todo" }] },
    { kind: "table", title: "Rendez-vous à venir", columns: [{ label: "Date", width: 0.3 }, { label: "Objet", width: 0.7 }], rows: [["03/11/2026 10:00", "Entretien Campus France"]] },
    { kind: "amounts", title: "Situation financière", rows: [{ label: "Déjà payé", value: "200 000 FCFA" }, { label: "Reste à payer", value: "150 000 FCFA", strong: true }] },
    { kind: "text", title: "Conditions", text: "Valable 30 jours." },
  ],
  footer: ["Document de suivi : il ne constitue ni une facture ni un reçu."],
  isDemo: false,
};

describe("PDF des documents (devis, récapitulatif, confirmation)", () => {
  it("produit un A4 d'une page pour un document court", async () => {
    const pdf = await PDFDocument.load(await renderSpecPdf(base, {}));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Récapitulatif de dossier DOS-2026-00001");
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
  });

  it("passe à la page suivante sans rien perdre quand le document est long", async () => {
    const long: DocumentSpec = {
      ...base,
      watermark: "ANNULÉ",
      sections: [
        { kind: "checklist", title: "Pièces", items: Array.from({ length: 70 }, (_, i) => ({ label: `Pièce ${i + 1} avec un intitulé assez long pour être replié sur deux lignes dans le document`, state: "warning" as const })) },
        { kind: "text", title: "Détails", text: "Ligne de détail. ".repeat(600) },
      ],
    };
    expect((await PDFDocument.load(await renderSpecPdf(long, {}))).getPageCount()).toBeGreaterThan(2);
  });

  it("ignore une image illisible", async () => {
    const pdf = await renderSpecPdf(base, { logo: new Uint8Array([1, 2, 3]), stamp: new Uint8Array([0x89, 0x50, 0]) });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
