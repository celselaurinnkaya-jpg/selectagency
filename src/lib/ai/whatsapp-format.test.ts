import { describe, expect, it } from "vitest";
import { toWhatsAppText } from "./whatsapp-format";

describe("toWhatsAppText", () => {
  it("remplace le gras Markdown par le gras WhatsApp", () => {
    expect(toWhatsAppText("Les **pièces requises** sont :")).toBe("Les *pièces requises* sont :");
  });

  it("retire les titres et garde le texte", () => {
    expect(toWhatsAppText("## Tarifs\nVoici nos services")).toBe("Tarifs\nVoici nos services");
  });

  it("écrit les liens en clair", () => {
    expect(toWhatsAppText("Voir [notre page](https://exemple.com/visa)")).toBe("Voir notre page : https://exemple.com/visa");
  });

  it("laisse intact un texte déjà adapté à WhatsApp", () => {
    expect(toWhatsAppText("Bonjour *Awa*, votre _dossier_ avance.")).toBe("Bonjour *Awa*, votre _dossier_ avance.");
  });
});
