/** Base fictive pour lire l'adresse comme le ferait le navigateur (jamais visitée). */
const BASE = "https://select-agency.invalid";

/**
 * Adresse de retour après connexion : uniquement un chemin interne (« /clients »), jamais une
 * adresse externe (« //site.com », « https://… ») qui permettrait une redirection piégée.
 * Les caractères invisibles (tabulation, retour à la ligne…) et les barres obliques inversées sont refusés :
 * le navigateur les retire ou les transforme, et « /<tabulation>/site.com » deviendrait « //site.com ».
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  // Dernière vérification : lue par le navigateur, l'adresse doit rester sur le site.
  try {
    if (new URL(next, BASE).origin !== BASE) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
