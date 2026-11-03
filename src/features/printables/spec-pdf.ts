import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type RGB } from "pdf-lib";
import { initials } from "@/lib/format";
import type { InvoiceImageKind } from "@/lib/domain/types";
import {
  A4, BORDER, BOTTOM, CITRON, DEMO, embedImage, FAINT, fit, INK, M, MUTED, NAVY, pdfText, RIGHT, roundedRect, SURFACE, WIDTH, wrap, type PdfImages,
} from "@/features/invoices/pdf";
import type { ChecklistState, DocumentSpec, SpecSection } from "./spec";
import { CHECKLIST_LABEL } from "./spec";

// PDF A4 d'un document du modèle commun (devis, récapitulatif, confirmation), même mise en page que
// la page imprimable. Passage à la page suivante sans couper une ligne ; numéros de page si plusieurs.

const EMERALD = rgb(5 / 255, 150 / 255, 105 / 255);
const ORANGE = rgb(234 / 255, 88 / 255, 12 / 255);
const MARK = rgb(254 / 255, 226 / 255, 226 / 255);

export async function renderSpecPdf(spec: DocumentSpec, images: PdfImages): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`${spec.title.charAt(0)}${spec.title.slice(1).toLowerCase()} ${spec.number}`));
  doc.setAuthor(pdfText(spec.issuer.name));
  doc.setCreator("SELECT Agency");
  doc.setProducer("SELECT Agency");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const embedded: Partial<Record<InvoiceImageKind, PDFImage>> = {};
  for (const [kind, bytes] of Object.entries(images) as [InvoiceImageKind, Uint8Array][]) embedded[kind] = await embedImage(doc, bytes);

  let page = newPage();
  let y = A4.height - M;

  function newPage() {
    const p = doc.addPage([A4.width, A4.height]);
    if (spec.watermark) {
      const size = 90;
      const safe = pdfText(spec.watermark);
      const w = bold.widthOfTextAtSize(safe, size);
      const angle = (30 * Math.PI) / 180;
      p.drawText(safe, { x: A4.width / 2 - (w / 2) * Math.cos(angle), y: A4.height / 2 - (w / 2) * Math.sin(angle), size, font: bold, color: MARK, rotate: degrees(30) });
    }
    return p;
  }
  function ensure(height: number) {
    if (y - height < BOTTOM) {
      page = newPage();
      y = A4.height - M;
    }
  }
  const text = (value: string, x: number, top: number, size: number, f: PDFFont = font, color: RGB = INK) => page.drawText(pdfText(value), { x, y: top - size, size, font: f, color });
  const textRight = (value: string, right: number, top: number, size: number, f: PDFFont = font, color: RGB = INK) => {
    const safe = pdfText(value);
    page.drawText(safe, { x: right - f.widthOfTextAtSize(safe, size), y: top - size, size, font: f, color });
  };
  const line = (top: number, x1 = M, x2 = RIGHT, color = BORDER) => page.drawLine({ start: { x: x1, y: top }, end: { x: x2, y: top }, thickness: 0.8, color });

  // En-tête : titre, numéro, logo.
  const titleSize = spec.title.length > 20 ? 19 : 24;
  text(spec.title, M, y, titleSize, bold, NAVY);
  text(spec.numberLabel, M, y - 34, 9.5, font, MUTED);
  const chipX = M + font.widthOfTextAtSize(pdfText(spec.numberLabel), 9.5) + 8;
  roundedRect(page, chipX, y - 31, mono.widthOfTextAtSize(pdfText(spec.number), 9) + 12, 16, 4, SURFACE);
  text(spec.number, chipX + 6, y - 35, 9, mono);
  if (embedded.logo) {
    const box = fit(embedded.logo, 140, 64);
    page.drawImage(embedded.logo, { x: RIGHT - box.width, y: y - box.height, ...box });
  } else {
    page.drawCircle({ x: RIGHT - 28, y: y - 28, size: 28, color: NAVY });
    const ini = pdfText(initials(spec.issuer.name) || "A");
    page.drawText(ini, { x: RIGHT - 28 - bold.widthOfTextAtSize(ini, 15) / 2, y: y - 33, size: 15, font: bold, color: CITRON });
  }
  y -= 64;
  line(y);
  y -= 12;

  // Agence et destinataire, puis informations clés sur deux colonnes.
  const colW = (WIDTH - 24) / 2;
  const colX = [M, M + colW + 24];
  let lowest = y;
  [
    { title: spec.issuerTitle, party: spec.issuer },
    { title: spec.recipientTitle, party: spec.recipient },
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
  y = lowest - 6;
  for (let i = 0; i < spec.facts.length; i += 2) {
    const pair = spec.facts.slice(i, i + 2).map((f) => ({ ...f, lines: wrap(f.value, bold, 10, colW) }));
    const height = 13 + Math.max(...pair.map((f) => f.lines.length)) * 12 + 4;
    ensure(height);
    pair.forEach((fact, j) => {
      text(fact.label, colX[j]!, y, 8.5, font, FAINT);
      fact.lines.forEach((l, k) => text(l, colX[j]!, y - 13 - k * 12, 10, bold));
    });
    y -= height;
  }
  y -= 4;

  for (const section of spec.sections) drawSection(section);

  function sectionTitle(title: string, following: number) {
    ensure(22 + following);
    text(title, M, y, 9, font, MUTED);
    y -= 15;
  }

  function drawSection(section: SpecSection) {
    if (section.kind === "text") {
      const lines = wrap(section.text, font, 9, WIDTH - 20);
      const h = lines.length * 12 + 12;
      sectionTitle(section.title, Math.min(h, 120));
      // Texte long : on le coupe par paquets qui tiennent sur la page.
      let i = 0;
      while (i < lines.length) {
        const fitCount = Math.max(1, Math.min(lines.length - i, Math.floor((y - BOTTOM - 12) / 12)));
        const chunk = lines.slice(i, i + fitCount);
        const boxH = chunk.length * 12 + 12;
        roundedRect(page, M, y, WIDTH, boxH, 5, undefined, BORDER);
        chunk.forEach((l, k) => text(l, M + 10, y - 6 - k * 12, 9, font, MUTED));
        y -= boxH + 12;
        i += fitCount;
        if (i < lines.length) {
          page = newPage();
          y = A4.height - M;
        }
      }
      return;
    }
    if (section.kind === "amounts") {
      const boxW = 260;
      const boxH = section.rows.length * 16 + 30;
      ensure(boxH + 10);
      roundedRect(page, RIGHT - boxW, y, boxW, boxH, 6, SURFACE);
      text(section.title, RIGHT - boxW + 12, y - 10, 9, font, MUTED);
      let top = y - 26;
      for (const row of section.rows) {
        const f = row.strong ? bold : font;
        const color = row.strong ? NAVY : MUTED;
        text(row.label, RIGHT - boxW + 12, top, 9.5, f, color);
        textRight(row.value, RIGHT - 12, top, 9.5, f, color);
        top -= 16;
      }
      y -= boxH + 8;
      return;
    }
    if (section.kind === "checklist") {
      sectionTitle(section.title, 20);
      if (section.items.length === 0) {
        text(section.empty ?? "Rien à signaler.", M, y, 9, font, FAINT);
        y -= 20;
        return;
      }
      line(y + 4);
      // Liste longue (étapes, pièces) : deux colonnes, comme sur la page imprimable.
      if (section.items.length > 6) {
        const colW = (WIDTH - 20) / 2;
        for (let i = 0; i < section.items.length; i += 2) {
          const pair = section.items.slice(i, i + 2).map((item) => {
            const detail = item.detail ?? CHECKLIST_LABEL[item.state];
            const detailW = Math.min(110, font.widthOfTextAtSize(pdfText(detail), 8) + 4);
            const f = item.state === "current" ? bold : font;
            return { item, detail, f, lines: wrap(item.label, f, 9, colW - 16 - detailW - 6) };
          });
          const h = Math.max(...pair.map((p) => p.lines.length)) * 11 + 5;
          ensure(h);
          pair.forEach((p, j) => {
            const x0 = M + j * (colW + 20);
            drawDot(p.item.state, x0 + 5, y - 6);
            p.lines.forEach((l, k) => text(l, x0 + 16, y - 1 - k * 11, 9, p.f));
            textRight(p.detail, x0 + colW, y - 1, 8, font, FAINT);
          });
          y -= h;
          line(y + 3, M, RIGHT, SURFACE);
        }
        y -= 10;
        return;
      }
      for (const item of section.items) {
        const detail = item.detail ?? CHECKLIST_LABEL[item.state];
        const detailW = Math.min(170, font.widthOfTextAtSize(pdfText(detail), 8.5) + 4);
        const labelLines = wrap(item.label, item.state === "current" ? bold : font, 9.5, WIDTH - 22 - detailW - 10);
        const h = labelLines.length * 12 + 8;
        ensure(h);
        drawDot(item.state, M + 5, y - 7);
        labelLines.forEach((l, k) => text(l, M + 18, y - 1 - k * 12, 9.5, item.state === "current" ? bold : font));
        textRight(detail, RIGHT, y - 1, 8.5, font, FAINT);
        y -= h;
        line(y + 3, M, RIGHT, SURFACE);
      }
      y -= 10;
      return;
    }
    // Tableau.
    const xs: number[] = [];
    let acc = M;
    for (const col of section.columns) {
      xs.push(acc);
      acc += col.width * WIDTH;
    }
    const header = () => {
      section.columns.forEach((col, i) => {
        if (col.align === "right") textRight(col.label, xs[i]! + col.width * WIDTH, y, 8.5, font, FAINT);
        else text(col.label, xs[i]!, y, 8.5, font, FAINT);
      });
      y -= 14;
      line(y);
      y -= 8;
    };
    sectionTitle(section.title, 40);
    if (section.rows.length === 0) {
      text(section.empty ?? "Aucune ligne.", M, y, 9, font, FAINT);
      y -= 20;
    } else {
      header();
      for (const row of section.rows) {
        const cells = row.map((cell, i) => (section.columns[i]?.align === "right" ? [pdfText(cell)] : wrap(cell, font, 9.5, section.columns[i]!.width * WIDTH - 8)));
        const h = Math.max(...cells.map((c) => c.length)) * 12 + 10;
        if (y - h < BOTTOM) {
          page = newPage();
          y = A4.height - M;
          header();
        }
        cells.forEach((cellLines, i) => {
          const col = section.columns[i]!;
          cellLines.forEach((l, k) => {
            if (col.align === "right") textRight(l, xs[i]! + col.width * WIDTH, y - k * 12, 9.5);
            else text(l, xs[i]!, y - k * 12, 9.5);
          });
        });
        y -= h;
        line(y + 4, M, RIGHT, SURFACE);
      }
    }
    if (section.total) {
      const boxW = 250;
      ensure(44);
      y -= 6;
      roundedRect(page, RIGHT - boxW, y, boxW, 30, 6, SURFACE);
      text(section.total.label, RIGHT - boxW + 12, y - 9, 11, bold, NAVY);
      textRight(section.total.value, RIGHT - 12, y - 9, 11, bold, NAVY);
      y -= 40;
    } else y -= 8;
  }

  function drawDot(state: ChecklistState, x: number, cy: number) {
    const colors: Record<ChecklistState, { fill?: RGB; border: RGB }> = {
      done: { fill: EMERALD, border: EMERALD },
      current: { border: NAVY },
      todo: { border: rgb(0.8, 0.83, 0.87) },
      skipped: { fill: rgb(0.89, 0.91, 0.94), border: rgb(0.8, 0.83, 0.87) },
      warning: { fill: rgb(1, 0.93, 0.84), border: ORANGE },
    };
    const c = colors[state];
    page.drawCircle({ x, y: cy, size: 4, color: c.fill, borderColor: c.border, borderWidth: 1.5 });
  }

  // Signature et cachet.
  const sign = { x: RIGHT - 180, w: 180, h: 60 };
  ensure(sign.h + 40);
  line(y);
  y -= 12;
  const blockTop = y;
  if (embedded.stamp) {
    const box = fit(embedded.stamp, 110, sign.h);
    page.drawImage(embedded.stamp, { x: sign.x + (sign.w - box.width) / 2, y: blockTop - sign.h + (sign.h - box.height) / 2, opacity: 0.9, ...box });
  }
  if (embedded.signature) {
    const box = fit(embedded.signature, 160, 64);
    page.drawImage(embedded.signature, { x: sign.x + (sign.w - box.width) / 2, y: blockTop - sign.h + (sign.h - box.height) / 2, ...box });
  }
  if (!embedded.stamp && !embedded.signature) line(blockTop - sign.h + 4, sign.x, RIGHT, rgb(0.8, 0.83, 0.87));
  textRight(spec.signatoryName || "Signature et cachet", RIGHT, blockTop - sign.h - 6, 9.5, bold);
  y = blockTop - sign.h - 20;

  // Mentions.
  const footer = spec.footer.flatMap((entry) => wrap(entry, font, 7.5, WIDTH));
  if (footer.length || spec.isDemo) {
    ensure(footer.length * 10 + 24);
    line(y);
    y -= 10;
    for (const l of footer) {
      text(l, M, y, 7.5, font, FAINT);
      y -= 10;
    }
    if (spec.isDemo) text("Document de démonstration : données fictives, sans valeur.", M, y, 7.5, bold, DEMO);
  }

  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const label = pdfText(`${spec.number} · page ${i + 1} sur ${pages.length}`);
      p.drawText(label, { x: A4.width / 2 - font.widthOfTextAtSize(label, 7.5) / 2, y: M / 2, size: 7.5, font, color: FAINT });
    });
  }
  return doc.save();
}
