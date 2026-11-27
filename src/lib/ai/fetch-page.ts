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

/** Les 8 groupes de 16 bits d'une adresse IPv6 (forme abrégée « :: » et IPv4 en fin d'adresse comprises). */
function ipv6Groups(ip: string): number[] | undefined {
  let text = ip.toLowerCase().split("%")[0]!;
  let tail: number[] = [];
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((n) => n > 255)) return undefined;
    tail = [(a << 8) | b, (c << 8) | d];
    text = text.slice(0, -dotted[0].length);
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1);
  }
  const parse = (part: string) => (part ? part.split(":").map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN)) : []);
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - rest.length - tail.length;
  const groups = halves.length === 2 ? [...head, ...Array<number>(Math.max(missing, 0)).fill(0), ...rest, ...tail] : [...head, ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g)) ? groups : undefined;
}

function isPublicIpv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return false;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // Adresse IPv4 cachée dans une IPv6 (« ::ffff:a9fe:a9fe » = 169.254.169.254) : on vérifie l'IPv4.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0) return false; // « :: » et « ::1 »
    return isPublicIpv4(v4(g[6]!, g[7]!));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicIpv4(v4(g[6]!, g[7]!)); // NAT64
  if (g[0] === 0x2002) return isPublicIpv4(v4(g[1]!, g[2]!)); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // adresses à jeter
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // adresses privées uniques
  if ((g[0]! & 0xffc0) === 0xfe80) return false; // lien local
  if ((g[0]! & 0xff00) === 0xff00) return false; // multidiffusion
  return true;
}

/** Adresse IP publique (ni interne, ni locale, ni réservée), en IPv4 comme en IPv6. */
export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPublicIpv4(ip);
  if (isIP(ip) === 6) return isPublicIpv6(ip);
  return false;
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
