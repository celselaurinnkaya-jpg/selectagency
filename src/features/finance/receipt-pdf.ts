import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage } from "pdf-lib";
import { formatMoney, initials } from "@/lib/format";
import type { InvoiceImageKind } from "@/lib/domain/types";
import {
  A4, BORDER, BOTTOM, CITRON, DEMO, embedImage, FAINT, fit, INK, M, MUTED, NAVY, pdfText, RIGHT, roundedRect, SURFACE, WIDTH, wrap, type PdfImages,
} from "@/features/invoices/pdf";
import { RECEIPT_MENTION, type ReceiptDocumentData } from "./receipt";

// PDF du reçu (A4), même mise en page que la page imprimable et même charte que les factures.

const VOID = rgb(185 / 255, 28 / 255, 28 / 255);
const VOID_MARK = rgb(254 / 255, 226 / 255, 226 / 255);

export async function renderReceiptPdf(data: ReceiptDocumentData, images: PdfImages): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`Reçu ${data.number}`));
  doc.setAuthor(pdfText(data.issuer.name));
  doc.setCreator("SELECT Agency");
  doc.setProducer("SELECT Agency");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const embedded: Partial<Record<InvoiceImageKind, PDFImage>> = {};
  for (const [kind, bytes] of Object.entries(images) as [InvoiceImageKind, Uint8Array][]) {
    embedded[kind] = await embedImage(doc, bytes);
  }

  const money = (amount: number) => pdfText(formatMoney(amount, data.currency));
  let page = newPage();
  let y = A4.height - M;

  function newPage() {
    const p = doc.addPage([A4.width, A4.height]);
    if (data.voided) {
      const size = 96;
      const w = bold.widthOfTextAtSize("ANNULÉ", size);
      const angle = (30 * Math.PI) / 180;
      p.drawText(pdfText("ANNULÉ"), {
        x: A4.width / 2 - (w / 2) * Math.cos(angle),
        y: A4.height / 2 - (w / 2) * Math.sin(angle),
        size, font: bold, color: VOID_MARK, rotate: degrees(30),
      });
    }
    return p;
  }

  function ensure(height: number) {
    if (y - height < BOTTOM) {
      page = newPage();
      y = A4.height - M;
    }
  }

  const text = (value: string, x: number, top: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(pdfText(value), { x, y: top - size, size, font: f, color });
  const textRight = (value: string, right: number, top: number, size: number, f: PDFFont = font, color = INK) => {
    const safe = pdfText(value);
    page.drawText(safe, { x: right - f.widthOfTextAtSize(safe, size), y: top - size, size, font: f, color });
  };
  const line = (top: number, x1 = M, x2 = RIGHT, color = BORDER) => page.drawLine({ start: { x: x1, y: top }, end: { x: x2, y: top }, thickness: 0.8, color });

  // En-tête : titre, numéro, logo.
  text("REÇU DE PAIEMENT", M, y, 24, bold, NAVY);
  const label = "N° de reçu";
  text(label, M, y - 34, 9.5, font, MUTED);
  const chipX = M + font.widthOfTextAtSize(label, 9.5) + 8;
  const chipW = mono.widthOfTextAtSize(pdfText(data.number), 9) + 12;
  roundedRect(page, chipX, y - 31, chipW, 16, 4, SURFACE);
  text(data.number, chipX + 6, y - 35, 9, mono, INK);
  if (embedded.logo) {
    const box = fit(embedded.logo, 140, 64);
    page.drawImage(embedded.logo, { x: RIGHT - box.width, y: y - box.height, ...box });
  } else {
    page.drawCircle({ x: RIGHT - 28, y: y - 28, size: 28, color: NAVY });
    const ini = pdfText(initials(data.issuer.name) || "A");
    page.drawText(ini, { x: RIGHT - 28 - bold.widthOfTextAtSize(ini, 15) / 2, y: y - 33, size: 15, font: bold, color: CITRON });
  }
  y -= 78;
  line(y);
  y -= 16;

  // Agence, client, date et moyen de paiement.
  const colW = (WIDTH - 24) / 2;
  const colX = [M, M + colW + 24];
  let lowest = y;
  [
    { title: "Délivré par", party: data.issuer },
    { title: "Reçu de", party: data.recipient },
  ].forEach(({ title, party }, i) => {
    let top = y;
    text(title, colX[i]!, top, 8.5, font, FAINT);
    top -= 13;
    for (const l of wrap(party.name, bold, 10, colW)) {
      text(l, colX[i]!, top, 10, bold);
      top -= 13;
    }
    for (const entry of party.lines) {
      for (const l of wrap(entry, font, 9, colW)) {
        text(l, colX[i]!, top, 9, font, MUTED);
        top -= 12;
      }
    }
    lowest = Math.min(lowest, top);
  });
  y = lowest - 10;
  const facts: [string, string][] = [
    ["Date du paiement", data.paidAtLabel],
    ["Moyen de paiement", data.method],
  ];
  if (data.payerName) facts.push(["Payé par", data.payerName]);
  for (let i = 0; i < facts.length; i += 2) {
    let rowLowest = y;
    facts.slice(i, i + 2).forEach(([title, value], j) => {
      text(title, colX[j]!, y, 8.5, font, FAINT);
      let top = y - 13;
      for (const l of wrap(value, bold, 10, colW)) {
        text(l, colX[j]!, top, 10, bold);
        top -= 13;
      }
      rowLowest = Math.min(rowLowest, top);
    });
    y = rowLowest - 8;
  }
  for (const l of wrap(`Dossier : ${data.caseLabel}`, font, 9, WIDTH)) {
    text(l, M, y, 9, font, MUTED);
    y -= 12;
  }
  y -= 12;

  // Affectation du paiement.
  const cols = { label: M, labelWidth: 250, nature: M + 270, amount: RIGHT };
  const tableHeader = () => {
    text("Affectation du paiement", M, y, 9, font, MUTED);
    y -= 20;
    text("Prestation", cols.label, y, 8.5, font, FAINT);
    text("Nature", cols.nature, y, 8.5, font, FAINT);
    textRight("Montant", cols.amount, y, 8.5, font, FAINT);
    y -= 14;
    line(y);
    y -= 8;
  };
  ensure(80);
  tableHeader();
  for (const item of data.lines) {
    const labelLines = wrap(item.label, font, 9.5, cols.labelWidth);
    const height = labelLines.length * 12 + 10;
    if (y - height < BOTTOM) {
      page = newPage();
      y = A4.height - M;
      tableHeader();
    }
    labelLines.forEach((l, i) => text(l, cols.label, y - i * 12, 9.5));
    text(item.nature, cols.nature, y, 9.5, font, MUTED);
    textRight(money(item.amountMinor), cols.amount, y, 9.5);
    y -= height;
    line(y + 4, M, RIGHT, SURFACE);
  }
  y -= 10;

  // Total reçu et reste à payer du dossier après ce paiement.
  const boxW = 250;
  const hasBalance = data.balanceAfterMinor !== undefined;
  const boxH = hasBalance ? 52 : 32;
  ensure(boxH + 12);
  roundedRect(page, RIGHT - boxW, y, boxW, boxH, 6, SURFACE);
  text("Total reçu", RIGHT - boxW + 12, y - 10, 12, bold, NAVY);
  textRight(money(data.amountMinor), RIGHT - 12, y - 10, 12, bold, NAVY);
  if (hasBalance) {
    text("Reste à payer sur le dossier", RIGHT - boxW + 12, y - 32, 9.5, font, MUTED);
    textRight(data.balanceAfterMinor === 0 ? "Soldé" : money(data.balanceAfterMinor!), RIGHT - 12, y - 32, 9.5, bold, data.balanceAfterMinor === 0 ? rgb(5 / 255, 120 / 255, 85 / 255) : INK);
  }
  y -= boxH + 14;

  // Reçu annulé : mention, date, auteur et motif.
  if (data.voided) {
    const detail = [data.voided.label, data.voided.reason && `motif : ${data.voided.reason}`].filter(Boolean).join(" · ");
    const detailLines = wrap(detail, font, 9, WIDTH - 24);
    const h = detailLines.length * 12 + 30;
    ensure(h + 10);
    roundedRect(page, M, y, WIDTH, h, 6, rgb(254 / 255, 242 / 255, 242 / 255), rgb(254 / 255, 202 / 255, 202 / 255));
    const title = pdfText("REÇU ANNULÉ");
    page.drawText(title, { x: A4.width / 2 - bold.widthOfTextAtSize(title, 11) / 2, y: y - 20, size: 11, font: bold, color: VOID });
    detailLines.forEach((l, i) => {
      const safe = pdfText(l);
      page.drawText(safe, { x: A4.width / 2 - font.widthOfTextAtSize(safe, 9) / 2, y: y - 34 - i * 12, size: 9, font, color: VOID });
    });
    y -= h + 14;
  }

  // Reçu par, signature et cachet.
  const sign = { x: RIGHT - 180, w: 180, h: 84 };
  ensure(sign.h + 40);
  line(y);
  y -= 16;
  const blockTop = y;
  text("Reçu par", M, blockTop - sign.h + 22, 8.5, font, FAINT);
  text(data.receivedBy ?? "—", M, blockTop - sign.h + 9, 10, bold);
  if (embedded.stamp) {
    const box = fit(embedded.stamp, 110, sign.h);
    page.drawImage(embedded.stamp, { x: sign.x + (sign.w - box.width) / 2, y: blockTop - sign.h + (sign.h - box.height) / 2, opacity: 0.9, ...box });
  }
  if (embedded.signature) {
    const box = fit(embedded.signature, 160, 72);
    page.drawImage(embedded.signature, { x: sign.x + (sign.w - box.width) / 2, y: blockTop - sign.h + (sign.h - box.height) / 2, ...box });
  }
  if (!embedded.stamp && !embedded.signature) line(blockTop - sign.h + 4, sign.x, RIGHT, rgb(0.8, 0.83, 0.87));
  textRight(data.signatoryName || "Signature et cachet", RIGHT, blockTop - sign.h - 6, 9.5, bold);
  y = blockTop - sign.h - 24;

  // Mentions.
  const footer = [RECEIPT_MENTION, ...(data.footerNote ? [data.footerNote] : [])].flatMap((entry) => wrap(entry, font, 7.5, WIDTH));
  ensure(footer.length * 10 + 30);
  line(y);
  y -= 10;
  for (const l of footer) {
    text(l, M, y, 7.5, font, FAINT);
    y -= 10;
  }
  if (data.isDemo) text("Document de démonstration : données fictives, sans valeur.", M, y, 7.5, bold, DEMO);

  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const label = pdfText(`${data.number} · page ${i + 1} sur ${pages.length}`);
      p.drawText(label, { x: A4.width / 2 - font.widthOfTextAtSize(label, 7.5) / 2, y: M / 2, size: 7.5, font, color: FAINT });
    });
  }
  return doc.save();
}
