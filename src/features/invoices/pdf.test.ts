import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { InvoiceDocumentData } from "./document";
import { pdfText, renderInvoicePdf } from "./pdf";

vi.mock("server-only", () => ({}));

const base: InvoiceDocumentData = {
  number: "FAC-2026-00001",
  status: "issued",
  overdue: false,
  issueDate: "2026-11-02",
  dueDate: "2026-11-30",
  currency: "XAF",
  issuer: { name: "Agence Étoile SARL", lines: ["Akwa, Douala", "+237 690 00 00 00", "NIU M0123"] },
  recipient: { name: "Paul Mbarga", lines: ["Bonamoussadi, Douala", "Client CLI-2026-00001"] },
  caseLabel: "DOS-2026-00001 — Master à Lyon",
  items: [{ label: "Accompagnement Campus France", quantity: 2, unitAmountMinor: 150000, taxRate: 19.25 }],
  discountLabel: "Fidélité",
  discountMinor: 15000,
  paymentDetails: "Orange Money : 690 00 00 00",
  isDemo: false,
};

describe("PDF des factures", () => {
  it("garde le français et remplace ce que les polices standard ne savent pas écrire", () => {
    expect(pdfText("150 000 FCFA")).toBe("150 000 FCFA");
    expect(pdfText("− 5 € · réglé’ ✓")).toBe("- 5 € · réglé’ ?");
    expect(pdfText("10 000 ₦")).toBe("10 000 NGN");
  });

  it("produit une facture d'une page, puis plusieurs pages pour 50 lignes", async () => {
    const one = await PDFDocument.load(await renderInvoicePdf(base, {}));
    expect(one.getPageCount()).toBe(1);
    expect(one.getTitle()).toBe("Facture FAC-2026-00001");

    const long = { ...base, status: "draft" as const, notes: "Acompte de 50 %.", footerNote: "Pénalités de retard : 10 % par an.", items: Array.from({ length: 50 }, (_, i) => ({ label: `Prestation ${i + 1} avec une désignation assez longue pour passer sur deux lignes dans le tableau`, quantity: 1, unitAmountMinor: 10000, taxRate: 0 })) };
    expect((await PDFDocument.load(await renderInvoicePdf(long, {}))).getPageCount()).toBeGreaterThan(2);
  });

  it("ignore une image illisible au lieu d'échouer", async () => {
    const pdf = await renderInvoicePdf(base, { logo: new Uint8Array([0x89, 0x50, 1, 2, 3]), stamp: new Uint8Array([1, 2, 3]) });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
