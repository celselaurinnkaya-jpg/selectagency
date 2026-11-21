// Mise en forme d'une réponse de l'IA pour WhatsApp, qui n'affiche pas le Markdown :
// « **gras** » y apparaîtrait avec les étoiles. WhatsApp met en gras avec une seule étoile (*gras*)
// et en italique avec un seul tiret bas (_italique_).

export function toWhatsAppText(text: string): string {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "_$1_")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 : $2")
    .trim();
}
