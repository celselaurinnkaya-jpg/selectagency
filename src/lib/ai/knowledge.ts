/**
 * Module RAG et Base de connaissances pour l'Agent IA de SELECT Agency.
 * Découpe les textes, notes et documents en fragments (chunks) cohérents
 * et prépare le contexte documentaire injecté au modèle IA.
 */

export interface KnowledgeSnippet {
  chunkId?: string;
  sourceId?: string;
  sourceTitle: string;
  content: string;
  rank?: number;
}

/**
 * Découpe un texte en fragments (chunks) textuels sans couper les phrases au milieu.
 * @param text Le texte source brut à découper
 * @param maxChars Taille maximale indicative d'un fragment (~100 à 150 mots)
 * @param overlap Caractères de chevauchement entre deux fragments successifs
 */
export function chunkText(text: string, maxChars = 600, overlap = 80): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  if (clean.length <= maxChars) {
    return [clean];
  }

  // Découpage prioritaire par paragraphes
  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // Si un paragraphe est très long, on découpe par phrases
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= maxChars) {
          currentChunk = (currentChunk + " " + sentence).trim();
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = sentence.trim();
        }
      }
    } else {
      if ((currentChunk + "\n\n" + para).trim().length <= maxChars) {
        currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        // Chevauchement pour préserver le contexte
        const tail = currentChunk.slice(-overlap);
        currentChunk = tail.length > 20 ? `...${tail}\n\n${para}` : para;
      }
    }
  }

  if (currentChunk && !chunks.includes(currentChunk)) {
    chunks.push(currentChunk);
  }

  return chunks.filter((c) => c.trim().length > 15);
}

/**
 * Formate une liste de fragments trouvés pour inclusion dans le prompt système du modèle.
 */
export function formatKnowledgeForPrompt(snippets: KnowledgeSnippet[]): string {
  if (!snippets.length) return "";

  return snippets
    .map((s, idx) => `[Source ${idx + 1} : "${s.sourceTitle}"]\n${s.content}`)
    .join("\n\n---\n\n");
}

