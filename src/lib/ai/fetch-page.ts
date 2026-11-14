import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Lecture d'une page web publique (site, boutique, page Facebook) pour la base de connaissances de l'agent.
// Seul le texte réellement présent sur la page est gardé : rien n'est complété ni inventé.
// Protection contre les adresses internes : seuls http et https vers une adresse publique, ports standards,
// et chaque redirection est vérifiée de la même façon.

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 20_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
/** En dessous, la page n'a pas livré de contenu utile (page de connexion, page vide, contenu chargé par script). */
const MIN_USEFUL_TEXT = 200;

export type PageReadResult = { ok: true; url: string; title: string; text: string } | { ok: false; error: string };

const UNREADABLE =
  "Cette page ne se laisse pas lire automatiquement (c'est souvent le cas de Facebook, qui demande une connexion). " +
  "Copiez le texte utile de la page et ajoutez-le avec « Ajouter un texte ».";

function isPublicIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // partage d'adresses des opérateurs
  if (a === 169 && b === 254) return false; // lien local, métadonnées des hébergeurs
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false; // multidiffusion et réservé
  return true;
}

function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPublicIpv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]!);
  if (v6 === "::" || v6 === "::1") return false;
  if (/^f[cd]/.test(v6)) return false; // adresses privées uniques
  if (/^fe[89ab]/.test(v6)) return false; // lien local
  if (v6.startsWith("ff")) return false; // multidiffusion
  return true;
}

async function checkUrl(raw: string): Promise<URL | string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Adresse invalide : elle doit commencer par https://";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Seules les adresses http et https sont acceptées.";
  if (url.username || url.password) return "Adresse refusée.";
  if (url.port && url.port !== "80" && url.port !== "443") return "Adresse refusée.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "Adresse refusée.";
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((a) => !isPublicIp(a.address))) return "Adresse refusée.";
  } catch {
    return "Ce site est introuvable. Vérifiez l'adresse.";
  }
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function metaContent(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : undefined;
}

/** Texte lisible d'une page HTML : titre, description, puis le corps sans scripts ni styles. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const description = metaContent(html, "description") ?? metaContent(html, "og:description");
  const body = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  const parts = [description, body].filter((p): p is string => Boolean(p && p.trim()));
  return { title, text: parts.join("\n\n").slice(0, MAX_TEXT) };
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

export async function readPublicPage(rawUrl: string): Promise<PageReadResult> {
  let current = rawUrl.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = await checkUrl(current);
    if (typeof checked === "string") return { ok: false, error: checked };
    let response: Response;
    try {
      response = await fetch(checked, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "SELECT-Agency-Knowledge/1.0", Accept: "text/html,text/plain;q=0.9" },
      });
    } catch {
      return { ok: false, error: "Le site n'a pas répondu à temps. Réessayez plus tard." };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) return { ok: false, error: UNREADABLE };
      current = new URL(location, checked).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, error: response.status === 404 ? "Cette page n'existe pas (erreur 404)." : UNREADABLE };
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, error: "Ce lien ne mène pas à une page web. Pour un PDF, utilisez « Ajouter un document »." };
    }
    const raw = await readLimited(response);
    const { title, text } = /text\/plain/i.test(type) ? { title: "", text: raw.trim().slice(0, MAX_TEXT) } : htmlToText(raw);
    if (text.length < MIN_USEFUL_TEXT) return { ok: false, error: UNREADABLE };
    return { ok: true, url: checked.toString(), title, text };
  }
  return { ok: false, error: "Trop de redirections : copiez plutôt le texte de la page." };
}
