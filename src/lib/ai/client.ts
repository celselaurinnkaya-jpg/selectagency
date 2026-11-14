import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Client Anthropic officiel (serveur uniquement).
// La clé API ne transite jamais côté client.

let anthropicInstance: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey.length < 10) {
    return null;
  }
  if (!anthropicInstance) {
    anthropicInstance = new Anthropic({ apiKey });
  }
  return anthropicInstance;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

