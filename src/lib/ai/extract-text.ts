import "server-only";
import mammoth from "mammoth";
import { extractText } from "unpdf";

// Lecture du texte d'un document envoyé dans la base de connaissances (PDF, Word .docx, texte).
// Le type est vérifié sur le contenu du fichier (signature), pas seulement sur son nom.
// Seul le texte réellement présent est gardé : un PDF scanné (image) est refusé avec une explication.

/** Taille maximale d'un document (la limite des envois du serveur est réglée à 4 Mo dans next.config.ts). */
export const MAX_DOCUMENT_BYTES = 3_500_000;
const MAX_TEXT = 280_000;
const MIN_TEXT = 30;

export type DocumentTextResult = { ok: true; text: string; kind: "pdf" | "docx" | "txt" } | { ok: false; error: string };

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK.. (un .docx est une archive zip)

function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

export async function extractDocumentText(fileName: string, bytes: Uint8Array): Promise<DocumentTextResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "Le fichier est vide." };
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "Fichier trop lourd : 3,5 Mo au plus. Compressez le PDF ou collez son texte avec « Ajouter un texte »." };
  }
  const name = fileName.toLowerCase();
  let kind: "pdf" | "docx" | "txt";
  let raw: string;
  try {
    if (startsWith(bytes, PDF)) {
      kind = "pdf";
      const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
      raw = text;
    } else if (startsWith(bytes, ZIP) && name.endsWith(".docx")) {
      kind = "docx";
      raw = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else if (name.endsWith(".txt")) {
      kind = "txt";
      raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else {
      return { ok: false, error: "Format non pris en charge : envoyez un PDF, un document Word (.docx) ou un fichier texte (.txt)." };
    }
  } catch {
    return { ok: false, error: "Ce fichier n'a pas pu être lu. Vérifiez qu'il n'est pas protégé par un mot de passe ou endommagé." };
  }
  const text = clean(raw);
  if (text.length < MIN_TEXT) {
    return {
      ok: false,
      error:
        kind === "pdf"
          ? "Ce PDF ne contient pas de texte lisible (document scanné ou image). Collez son contenu avec « Ajouter un texte »."
          : "Ce document ne contient presque pas de texte.",
    };
  }
  return { ok: true, text, kind };
}
