import { describe, expect, it } from "vitest";
import { createSeed } from "./fixtures";
import { buildRequirements, matchChecklistItems } from "@/features/documents/checklists";
import { findDuplicates } from "@/features/clients/duplicates";
import { formatMoney, initials } from "@/lib/format";

// Cohérence des données de démonstration : chaque écran doit raconter la même histoire.
describe("données de démonstration", () => {
  const db = createSeed();

  it("numérote les reçus sans doublon et dans l'ordre chronologique", () => {
    const sorted = [...db.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
    const numbers = sorted.map((p) => p.receiptNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual([...numbers].sort());
  });

  it("affecte chaque paiement en totalité à des prestations du même dossier", () => {
    for (const p of db.payments) {
      const total = p.allocations.reduce((s, a) => s + a.amountMinor, 0);
      expect(total).toBe(p.amountMinor);
      for (const a of p.allocations) expect(db.charges.find((c) => c.id === a.chargeId)?.caseId).toBe(p.caseId);
    }
  });

  it("a exactement une étape en cours par dossier actif, aucune pour un dossier clôturé", () => {
    for (const c of db.cases) {
      const inProgress = db.steps.filter((s) => s.caseId === c.id && s.status === "in_progress").length;
      expect(inProgress).toBe(c.status === "active" ? 1 : 0);
    }
  });

  it("n'affiche jamais un fait extérieur « confirmé » sans justificatif", () => {
    for (const s of db.steps.filter((x) => x.confirmationLevel === "confirmed")) expect(s.evidenceRef?.length).toBeGreaterThan(3);
    for (const a of db.appointments.filter((x) => x.kind === "administrative")) expect(a.status === "confirmed" ? !!a.externalReference : true).toBe(true);
  });

  it("utilise uniquement des adresses e-mail réservées aux exemples", () => {
    for (const c of db.clients) expect(c.email?.endsWith("@example.com") ?? true).toBe(true);
  });
});

describe("checklists", () => {
  it("ajoute les pièces du garant seulement pour un demandeur pris en charge", () => {
    const codes = (tags: Parameters<typeof matchChecklistItems>[2]) => matchChecklistItems("study_abroad", "FR", tags).map((i) => i.code);
    expect(codes([])).not.toContain("sponsor_bank_statement");
    expect(codes(["sponsored"])).toContain("sponsor_bank_statement");
  });

  it("crée des pièces « non reçues » sans doublon", () => {
    const list = buildRequirements("c1", "tourist_visa", "BE", ["minor"]);
    expect(new Set(list.map((r) => r.documentTypeCode)).size).toBe(list.length);
    expect(list.every((r) => r.status === "not_received")).toBe(true);
    expect(list.find((r) => r.documentTypeCode === "parental_consent")?.isRequired).toBe(true);
  });
});

describe("détection des doublons", () => {
  const { clients } = createSeed();
  it("compare le téléphone à l'identique (l'indicatif seul ne déclenche rien)", () => {
    expect(findDuplicates(clients, { firstName: "X", lastName: "Y", phoneE164: "+237" })).toHaveLength(0);
    expect(findDuplicates(clients, { firstName: "X", lastName: "Y", phoneE164: "+237690000142" })[0]?.reasons).toContain("même numéro de téléphone");
  });
  it("reconnaît un nom identique malgré les accents et la casse", () => {
    expect(findDuplicates(clients, { firstName: "marie louise", lastName: "BANYINGELA" })[0]?.client.reference).toBe("CLI-2026-00045");
  });
});

describe("mise en forme", () => {
  it("affiche le franc CFA sans décimale et l'euro avec deux décimales", () => {
    expect(formatMoney(1250000, "XAF").replace(/\s/g, " ")).toBe("1 250 000 FCFA");
    expect(formatMoney(9900, "EUR").replace(/\s/g, " ")).toBe("99,00 €");
  });
  it("prend l'initiale du prénom et du nom de famille", () => {
    expect(initials("Celse Laurin Nkaya")).toBe("CN");
    expect(initials("Rose")).toBe("R");
  });
});
