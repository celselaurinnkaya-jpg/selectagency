import { GoogleGenAI } from "@google/genai";
import { AI_NOT_CONFIGURED_GEMINI, AiUnavailableError } from "./runner";

// Initialisation du client Google Gemini avec la clé secrète SELECT Agency
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const key = (process.env.GEMINI_API_KEY || process.env["Gemini API Key"] || "").trim();
  if (!key) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

export interface GenererReponseAgentParams {
  promptAgence: string;
  contenuPdfAgence?: string;
  questionClient: string;
  historiqueMessages?: { role: "user" | "assistant"; content: string }[];
}

export interface GenererReponseAgentResult {
  text: string;
  model: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
}

/**
 * Modèles Google Gemini pris en charge par ordre de priorité :
 * - gemini-3.5-flash-lite : ultra-rapide (3s), stable, excellent rapport coût/vitesse
 * - gemini-3.5-flash : modèle flash polyvalent
 * - gemini-3.8-flash : modèle de dernière génération (repli si disponible)
 */
const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
];

/**
 * Moteur d'Intelligence Artificielle propulsé par Google Gemini.
 * Pris en charge par la plateforme SaaS SELECT Agency pour toutes les agences abonnées.
 */
export async function genererReponseAgent({
  promptAgence,
  contenuPdfAgence = "",
  questionClient,
  historiqueMessages = [],
}: GenererReponseAgentParams): Promise<GenererReponseAgentResult> {
  const client = getGeminiClient();

  // Pas de réponse inventée : sans clé, l'appelant reçoit une erreur claire.
  if (!client) throw new AiUnavailableError(AI_NOT_CONFIGURED_GEMINI);

  const promptComplet = `
[INSTRUCTIONS ET RÔLE DE L'AGENT]
${promptAgence || "Tu es le service client officiel de l'agence. Réponds courtoisement, précisément et chaleureusement aux demandes des clients."}

[BASE DE CONNAISSANCES DE L'AGENCE (DOCUMENTS PDF / LIENS / TARIFS)]
${contenuPdfAgence ? contenuPdfAgence : "Aucun document spécifique. Utilise les informations de ton rôle."}

[RÈGLE IMPORTANTE SUR LES TRANSFERTS HUMAINS]
Si le client demande expressément à parler à un conseiller humain ou si sa situation requiert l'intervention directe d'une personne de l'équipe, termine ta réponse en indiquant poliment que tu transmets la demande à un conseiller humain et ajoute la balise [DEMANDE_TRANSFERT] à la fin de ton message.

[HISTORIQUE RÉCENT DES ÉCHANGES]
${
  historiqueMessages.length > 0
    ? historiqueMessages.map((m) => `${m.role === "user" ? "Client" : "Assistant"}: ${m.content}`).join("\n")
    : "Début de la conversation."
}

[MESSAGE ACTUEL DU CLIENT SUR WHATSAPP]
${questionClient}
`.trim();

  let lastError: unknown = null;

  // Essai en cascade des modèles disponibles
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: promptComplet,
      });

      const reply = response.text?.trim();
      if (reply) {
        return {
          text: reply,
          model,
        };
      }
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Gemini] Le modèle ${model} n'a pas répondu (${errMsg}), test du modèle suivant...`);
    }
  }

  console.error("[Gemini] Échec de tous les modèles candidats :", lastError);

  // Pas de réponse de secours inventée : l'appelant affiche que le service n'a pas répondu.
  throw new AiUnavailableError("Le service d'IA n'a pas répondu. Réessayez dans un instant.");
}
