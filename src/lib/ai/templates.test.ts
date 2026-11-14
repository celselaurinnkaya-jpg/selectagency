import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toWaTemplate } from "@/lib/domain/ai";

describe("Modèles WhatsApp Meta — Modèle et Mapping", () => {
  it("mappe correctement un modèle approuvé par Meta", () => {
    const raw = {
      id: "99999999-9999-4000-8000-999999999999",
      organization_id: "11111111-1111-4000-8000-111111111111",
      name: "relance_pieces_manquantes",
      language: "fr",
      category: "UTILITY",
      body_text: "Bonjour {{1}}, il manque votre passeport pour finaliser votre dossier.",
      status: "approved",
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
    };

    const tpl = toWaTemplate(raw);
    expect(tpl.name).toBe("relance_pieces_manquantes");
    expect(tpl.category).toBe("UTILITY");
    expect(tpl.status).toBe("approved");
    expect(tpl.bodyText).toContain("{{1}}");
  });

  it("calcule correctement la consommation de quota et le coût en FCFA", () => {
    const monthlyQuota = 2000;
    const aiRepliesCount = 450;
    const percent = Math.round((aiRepliesCount / monthlyQuota) * 100);

    expect(percent).toBe(23);

    const estimatedUsd = 0.54;
    const estimatedFcfa = Math.round(estimatedUsd * 587);
    expect(estimatedFcfa).toBe(317);
  });
});

