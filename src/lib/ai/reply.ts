import { toWhatsAppText } from "./whatsapp-format";

// Dernière étape de toute réponse de l'agent IA, qu'elle vienne du testeur ou d'une vraie conversation WhatsApp :
// retrait de la balise de transfert, puis mise en forme WhatsApp. Pas d'expression régulière pour la balise :
// une classe de caractères mal écrite (« [DEMANDE_TRANSFERT] ») avait retiré des majuscules des réponses.

export const TRANSFER_TAG = "[DEMANDE_TRANSFERT]";

/** Formulations par lesquelles l'IA annonce qu'un conseiller prend le relais, sans la balise. */
const TRANSFER_PHRASES =
  /\b(transf[eè]re votre demande|transmets votre dossier|conseiller va prendre le relais|passe la main [aà] un conseiller|un conseiller humain va vous recontacter)\b/i;

export function finalizeAgentReply(raw: string, options: { detectPhrases?: boolean } = {}): { text: string; transfer: boolean } {
  const transfer = raw.includes(TRANSFER_TAG) || (options.detectPhrases === true && TRANSFER_PHRASES.test(raw));
  return { text: toWhatsAppText(raw.split(TRANSFER_TAG).join("")), transfer };
}
