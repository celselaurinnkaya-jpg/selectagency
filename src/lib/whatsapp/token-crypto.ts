import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Chiffrement du jeton d'accès Meta d'un numéro WhatsApp (AES-256-GCM) avant de le ranger dans la base.
// La clé est dérivée du secret serveur de SELECT (CRON_SECRET) : la base ne voit jamais le jeton en clair.
// Si ce secret change, il suffit de rescanner le QR code pour enregistrer un nouveau jeton.

const VERSION = "v1";

function key(serverSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", serverSecret, "select-agency", "whatsapp-business-token", 32));
}

export function encryptToken(token: string, serverSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(serverSecret), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(sealed: string, serverSecret: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(serverSecret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
