import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatMoney, initials } from "@/lib/format";
import type { InvoiceImageKind } from "@/lib/domain/types";
import { discountTitle, formatDay, watermark, type InvoiceDocumentData } from "./document";
import { formatTaxRate, invoiceTotals, lineAmount } from "./totals";

// PDF de la facture (A4), même mise en page que la page imprimable. Polices standard du PDF
// (Helvetica) : aucun fichier de police à charger ; leur jeu de caractères (WinAnsi) couvre le
// français, les autres caractères sont remplacés.

export const A4 = { width: 595.28, height: 841.89 };
export const M = 48;
export const RIGHT = A4.width - M;
export const WIDTH = RIGHT - M;
export const BOTTOM = M + 24;

export const NAVY = rgb(2 / 255, 55 / 255, 100 / 255);
export const CITRON = rgb(240 / 255, 255 / 255, 10 / 255);
export const INK = rgb(15 / 255, 23 / 255, 42 / 255);
export const MUTED = rgb(71 / 255, 85 / 255, 105 / 255);
export const FAINT = rgb(100 / 255, 116 / 255, 139 / 255);
export const BORDER = rgb(225 / 255, 230 / 255, 238 / 255);
export const SURFACE = rgb(243 / 255, 245 / 255, 248 / 255);
export const MARK = rgb(0.9, 0.91, 0.93);
const PAID = rgb(5 / 255, 150 / 255, 105 / 255);
export const DEMO = rgb(154 / 255, 52 / 255, 18 / 255);

const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Texte compatible avec les polices standard : espaces fines, signe moins et symboles inconnus remplacés. */
export function pdfText(text: string): string {
  return text
    .replace(/[    \t]/g, " ")
    .replace(/−/g, "-")
    .replace(/₦/g, "NGN")
    .replace(/GH₵|₵/g, "GHS")
    .replace(/[\r\x00-\x09\x0B-\x1F]/g, "")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, (c) => (WIN_ANSI_EXTRA.includes(c) ? c : "?"));
}

export type PdfImages = Partial<Record<InvoiceImageKind, Uint8Array>>;

export async function renderInvoicePdf(data: InvoiceDocumentData, images: PdfImages): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`Facture ${data.number ?? ""}`.trim()));
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
  const mark = watermark(data.status);
  let page = newPage();
  let y = A4.height - M;

  function newPage(): PDFPage {
    const p = doc.addPage([A4.width, A4.height]);
    if (mark) {
      const size = 96;
      const w = bold.widthOfTextAtSize(mark, size);
      const angle = (30 * Math.PI) / 180;
      p.drawText(pdfText(mark), {
        x: A4.width / 2 - (w / 2) * Math.cos(angle),
        y: A4.height / 2 - (w / 2) * Math.sin(angle),
        size, font: bold, color: MARK, rotate: degrees(30),
      });
    }
    return p;
  }

  /** Passe à la page suivante si la hauteur demandée ne tient plus. */
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
  text("FACTURE", M, y, 24, bold, NAVY);
  const label = "N° de facture";
  text(label, M, y - 34, 9.5, font, MUTED);
  const number = data.number ?? "attribué à l'enregistrement";
  const chipX = M + font.widthOfTextAtSize(label, 9.5) + 8;
  const chipW = mono.widthOfTextAtSize(pdfText(number), 9) + 12;
  roundedRect(page, chipX, y - 31, chipW, 16, 4, SURFACE);
  text(number, chipX + 6, y - 35, 9, mono, INK);
  if (embedded.logo) {
    const box = fit(embedded.logo, 140, 64);
    page.drawImage(embedded.logo, { x: RIGHT - box.width, y: y - box.height, ...box });
  } else {
    page.drawCircle({ x: RIGHT - 28, y: y - 28, size: 28, color: NAVY });
    const ini = pdfText(initials(data.issuer.name) || "A");
    page.drawText(ini, { x: RIGHT - 28 - bold.widthOfTextAtSize(ini, 15) / 2, y: y - 33, size: 15, font: bold, color: CITRON });
  }
  y -= 64;
  line(y);
  y -= 12;

  // Émetteur, destinataire, dates.
  const colW = (WIDTH - 24) / 2;
  const colX = [M, M + colW + 24];
  const parties = [
    { title: "Émise par", party: data.issuer },
    { title: "Facturée à", party: data.recipient },
  ];
  let lowest = y;
  parties.forEach(({ title, party }, i) => {
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
  y = lowest - 6;
  [
    ["Date d'émission", formatDay(data.issueDate)],
    ["Date d'échéance", formatDay(data.dueDate)],
  ].forEach(([title, value], i) => {
    text(title!, colX[i]!, y, 8.5, font, FAINT);
    text(value!, colX[i]!, y - 13, 10, bold);
  });
  y -= 28;
  if (data.caseLabel) {
    for (const l of wrap(`Dossier : ${data.caseLabel}`, font, 9, WIDTH)) {
      text(l, M, y, 9, font, MUTED);
      y -= 12;
    }
  }
  y -= 4;

  // Lignes de la facture.
  const cols = { label: M, labelWidth: 236, qty: M + 276, unit: M + 366, tax: M + 424, amount: RIGHT };
  const tableHeader = () => {
    text("Prestations", M, y, 9, font, MUTED);
    y -= 16;
    text("Désignation", cols.label, y, 8.5, font, FAINT);
    textRight("Qté", cols.qty, y, 8.5, font, FAINT);
    textRight("Prix unit.", cols.unit, y, 8.5, font, FAINT);
    textRight("Taxe", cols.tax, y, 8.5, font, FAINT);
    textRight("Montant", cols.amount, y, 8.5, font, FAINT);
    y -= 14;
    line(y);
    y -= 6;
  };
  ensure(80);
  tableHeader();
  for (const item of data.items) {
    const labelLines = wrap(item.label, font, 9.5, cols.labelWidth);
    const height = labelLines.length * 12 + 8;
    if (y - height < BOTTOM) {
      page = newPage();
      y = A4.height - M;
      tableHeader();
    }
    labelLines.forEach((l, i) => text(l, cols.label, y - i * 12, 9.5));
    textRight(String(item.quantity), cols.qty, y, 9.5);
    textRight(money(item.unitAmountMinor), cols.unit, y, 9.5);
    textRight(formatTaxRate(item.taxRate), cols.tax, y, 9.5);
    textRight(money(lineAmount(item)), cols.amount, y, 9.5);
    y -= height;
    line(y + 4, M, RIGHT, SURFACE);
  }
  y -= 6;

  // Totaux.
  const totals = invoiceTotals(data.items, data.discountMinor);
  const rows: [string, string][] = [["Sous-total", money(totals.subtotalMinor)]];
  if (totals.taxMinor > 0) rows.push(["Taxes", money(totals.taxMinor)]);
  if (totals.discountMinor > 0) rows.push([discountTitle(data.discountLabel), `- ${money(totals.discountMinor)}`]);
  const boxW = 250;
  const boxH = rows.length * 16 + 34;
  ensure(boxH + 10);
  roundedRect(page, RIGHT - boxW, y, boxW, boxH, 6, SURFACE);
  let rowTop = y - 10;
  for (const [title, value] of rows) {
    const shown = wrap(title, font, 9.5, boxW - 120)[0] ?? "";
    text(shown, RIGHT - boxW + 12, rowTop, 9.5, font, MUTED);
    textRight(value, RIGHT - 12, rowTop, 9.5, font, MUTED);
    rowTop -= 16;
  }
  page.drawLine({ start: { x: RIGHT - boxW + 12, y: rowTop + 3 }, end: { x: RIGHT - 12, y: rowTop + 3 }, thickness: 0.8, color: BORDER });
  text("Total à payer", RIGHT - boxW + 12, rowTop - 4, 11, bold, NAVY);
  textRight(money(totals.totalMinor), RIGHT - 12, rowTop - 4, 11, bold, NAVY);
  if (data.status === "paid") {
    page.drawRectangle({ x: M + 10, y: y - 52, width: 92, height: 30, borderColor: PAID, borderWidth: 2, rotate: degrees(8) });
    page.drawText("PAYÉE", { x: M + 24, y: y - 44, size: 16, font: bold, color: PAID, rotate: degrees(8) });
  }
  y -= boxH + 10;

  // Remarque.
  if (data.notes) {
    const noteLines = wrap(data.notes, font, 8.5, WIDTH - 20);
    const noteH = noteLines.length * 11 + 12;
    ensure(noteH + 10);
    roundedRect(page, M, y, WIDTH, noteH, 5, undefined, BORDER);
    noteLines.forEach((l, i) => text(l, M + 10, y - 6 - i * 11, 8.5, font, MUTED));
    y -= noteH + 10;
  }

  // Mode de paiement, signature et cachet.
  const payLines = data.paymentDetails ? wrap(data.paymentDetails, font, 9, colW) : [];
  ensure(Math.max(payLines.length * 12 + 30, 112));
  line(y);
  y -= 12;
  const blockTop = y;
  if (payLines.length) {
    text("Mode de paiement", M, blockTop, 9.5, bold);
    payLines.forEach((l, i) => text(l, M, blockTop - 15 - i * 12, 9, font, MUTED));
  }
  const sign = { x: RIGHT - 180, w: 180, h: 64 };
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
  y = Math.min(blockTop - payLines.length * 12 - 16, blockTop - sign.h - 20);

  // Mentions de bas de facture.
  const footer = [...(data.footerNote ? wrap(data.footerNote, font, 7.5, WIDTH) : [])];
  if (footer.length || data.isDemo) {
    ensure(footer.length * 10 + 30);
    line(y);
    y -= 10;
    for (const l of footer) {
      text(l, M, y, 7.5, font, FAINT);
      y -= 10;
    }
    if (data.isDemo) text("Document de démonstration : données fictives, sans valeur.", M, y, 7.5, bold, DEMO);
  }

  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const label = pdfText(`${data.number ?? "Facture"} · page ${i + 1} sur ${pages.length}`);
      p.drawText(label, { x: A4.width / 2 - font.widthOfTextAtSize(label, 7.5) / 2, y: M / 2, size: 7.5, font, color: FAINT });
    });
  }
  return doc.save();
}

export async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | undefined> {
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch {
    // Image illisible : la facture reste utilisable sans elle.
  }
  return undefined;
}

export function fit(image: PDFImage, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * ratio, height: image.height * ratio };
}

/** Rectangle à coins arrondis, repéré par son coin supérieur gauche. */
export function roundedRect(page: PDFPage, x: number, top: number, w: number, h: number, r: number, fill?: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>) {
  const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: top, color: fill, borderColor: border, borderWidth: border ? 0.8 : 0 });
}

/** Découpe un texte en lignes qui tiennent dans la largeur (retours à la ligne conservés). */
export function wrap(value: string, f: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of pdfText(value).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) out.push(current);
      current = word;
      // Mot plus long que la ligne (adresse e-mail, IBAN) : coupé au caractère.
      while (f.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && f.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) cut -= 1;
        out.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    out.push(current);
  }
  return out;
}
