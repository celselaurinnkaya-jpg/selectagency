import { describe, expect, it } from "vitest";
import type { MessageTemplate } from "@/lib/domain/types";
import { campaignStats } from "./campaigns";
import { whatsappDigits } from "./QuickContact";
import { bulletList, prepareMessages, renderTemplate } from "./templates";

const template = (id: string, body: string, audience: MessageTemplate["audience"] = "any", position = 10, isActive = true): MessageTemplate => ({
  id,
  title: `Modèle ${id}`,
  body,
  audience,
  position,
  isActive,
});

describe("modèles de messages (src/features/communications/templates.ts)", () => {
  const values = { prenom: "Aïcha", nom: "Mbarga", agence: "Agence K", conseiller: "Paul Ndongo", dossier: "DOS-2026-00042" };

  it("remplit les zones connues et signale celles que la fiche n'a pas", () => {
    expect(renderTemplate("Bonjour {prenom}, dossier {dossier}. {agence}", values)).toEqual({ text: "Bonjour Aïcha, dossier DOS-2026-00042. Agence K", missing: [] });
    expect(renderTemplate("Solde : {solde}", values)).toEqual({ text: "Solde : {solde}", missing: ["solde"] });
    // Zone inconnue (faute de frappe) : laissée telle quelle, visible par l'agent.
    expect(renderTemplate("Bonjour {prénom}", values).text).toBe("Bonjour {prénom}");
    expect(bulletList(["Passeport", "Relevés"])).toBe("- Passeport\n- Relevés");
    expect(bulletList([])).toBeUndefined();
  });

  it("propose les modèles actifs du bon public, dans l'ordre, et grise ceux sans donnée", () => {
    const messages = prepareMessages(
      [
        template("solde", "Solde : {solde}", "client", 30),
        template("prospect", "Bonjour {prenom}", "prospect", 10),
        template("tous", "{prenom}, à bientôt. {agence}", "any", 20),
        template("inactif", "Ancien", "any", 5, false),
      ],
      values,
      "client",
    );
    expect(messages.map((m) => [m.key, m.unavailable])).toEqual([
      ["tous", undefined],
      ["solde", "aucun solde à régler"],
    ]);
    expect(messages[0]!.text).toBe("Aïcha, à bientôt. Agence K");
  });

  it("garde toujours un message libre", () => {
    expect(prepareMessages([], values, "prospect")).toEqual([{ key: "libre", label: "Message libre", text: "Bonjour Aïcha,\n\n\n\nAgence K" }]);
  });
});

describe("contacts par campagne et lien WhatsApp", () => {
  it("compte les contacts et les clients par campagne, sans tenir compte des majuscules", () => {
    expect(
      campaignStats([
        { campaign: "Pub Facebook rentrée", status: "prospect" },
        { campaign: " pub facebook RENTRÉE ", status: "client" },
        { campaign: "Salon étudiant", status: "client" },
        { campaign: undefined, status: "prospect" },
      ]),
    ).toEqual([
      { campaign: "Pub Facebook rentrée", contacts: 2, clients: 1 },
      { campaign: "Salon étudiant", contacts: 1, clients: 1 },
    ]);
  });

  it("utilise le numéro WhatsApp, sinon le téléphone, jamais celui d'une fiche fictive", () => {
    expect(whatsappDigits({ phoneE164: "+237690000001", whatsappE164: "+33612345678" })).toBe("33612345678");
    expect(whatsappDigits({ phoneE164: "+237690000001" })).toBe("237690000001");
    expect(whatsappDigits({ phoneE164: "+237690000001", isDemoFixture: true })).toBeUndefined();
    expect(whatsappDigits({ phoneE164: "" })).toBeUndefined();
  });
});
