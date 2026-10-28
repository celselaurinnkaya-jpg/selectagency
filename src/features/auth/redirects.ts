/**
 * Adresse de retour après connexion : uniquement un chemin interne (« /clients »), jamais une
 * adresse externe (« //site.com », « https://… ») qui permettrait une redirection piégée.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
