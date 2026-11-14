import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDocumentText, MAX_DOCUMENT_BYTES } from "./extract-text";

async function pdfWith(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 750 - i * 20, size: 12, font }));
  return doc.save();
}

describe("extractDocumentText", () => {
  it("lit le texte d'un vrai PDF", async () => {
    const bytes = await pdfWith(["Pieces pour le visa etudiant :", "passeport valide, photos, attestation d'admission."]);
    const result = await extractDocumentText("brochure.pdf", bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("pdf");
      expect(result.text).toContain("passeport valide");
    }
  });

  it("refuse un PDF sans texte (document scanné) avec une explication", async () => {
    const result = await extractDocumentText("scan.pdf", await pdfWith([]));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("pas de texte lisible") });
  });

  it("refuse un fichier qui n'est ni PDF, ni Word, ni texte, même renommé en .pdf", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const result = await extractDocumentText("image.pdf", png);
    expect(result.ok).toBe(false);
  });

  it("lit un fichier texte et refuse un fichier trop lourd ou vide", async () => {
    const text = new TextEncoder().encode("Horaires de l'agence : du lundi au vendredi, de 8 h à 17 h.");
    expect(await extractDocumentText("infos.txt", text)).toMatchObject({ ok: true, kind: "txt" });
    expect((await extractDocumentText("gros.pdf", new Uint8Array(MAX_DOCUMENT_BYTES + 1))).ok).toBe(false);
    expect((await extractDocumentText("vide.pdf", new Uint8Array())).ok).toBe(false);
  });
});
