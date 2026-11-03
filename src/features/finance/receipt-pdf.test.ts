import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ReceiptDocumentData } from "./receipt";
import { renderReceiptPdf } from "./receipt-pdf";

vi.mock("server-only", () => ({}));

const base: ReceiptDocumentData = {
  number: "REC-2026-00004",
  paidAtLabel: "2 novembre 2026 à 10:15",
  currency: "XAF",
  amountMinor: 250000,
  issuer: { name: "Agence Étoile SARL", lines: ["Akwa, Douala", "+237 690 00 00 00"] },
  recipient: { name: "Paul Mbarga", lines: ["Bonamoussadi, Douala", "Client CLI-2026-00001"] },
  caseLabel: "DOS-2026-00001 — Master à Lyon",
  method: "Orange Money — réf. OM-261102-4471",
  payerName: "Paul Mbarga (garant)",
  receivedBy: "Aïcha Ngono",
  lines: [
    { label: "Accompagnement Campus France", nature: "Frais de l'agence", amountMinor: 200000 },
    { label: "Frais de visa", nature: "Montant destiné à un tiers", amountMinor: 50000 },
  ],
  isDemo: false,
};

describe("PDF des reçus", () => {
  it("produit un reçu A4 d'une page avec son numéro", async () => {
    const pdf = await PDFDocument.load(await renderReceiptPdf(base, {}));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Reçu REC-2026-00004");
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
  });

  it("garde un reçu annulé lisible, sur plusieurs pages si besoin", async () => {
    const voided = {
      ...base,
      voided: { label: "Le 3 novembre 2026 à 09:00 par Aïcha Ngono", reason: "Montant saisi deux fois" },
      footerNote: "Agence agréée n° 123.",
      lines: Array.from({ length: 60 }, (_, i) => ({ label: `Prestation ${i + 1} avec un libellé assez long pour passer sur deux lignes du tableau`, nature: "Frais de l'agence", amountMinor: 1000 })),
    };
    expect((await PDFDocument.load(await renderReceiptPdf(voided, {}))).getPageCount()).toBeGreaterThan(1);
  });

  it("ignore une image illisible au lieu d'échouer", async () => {
    const pdf = await renderReceiptPdf(base, { logo: new Uint8Array([0x89, 0x50, 1, 2, 3]), signature: new Uint8Array([1, 2]) });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
