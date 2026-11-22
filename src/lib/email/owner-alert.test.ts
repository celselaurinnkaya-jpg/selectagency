import { describe, expect, it } from "vitest";
import { PLATFORM_EMAIL_KINDS } from "./compose";
import { renderTransactionalEmail } from "./templates";

describe("alerte au propriétaire", () => {
  const payload = {
    agency_name: "Agence <Horizon>",
    owner_name: "Rita",
    alert_title: "Un paiement a été annulé",
    alert_message: "Un membre de votre équipe a annulé un paiement.",
    alert_rows: [
      { label: "Montant", value: "50 000 FCFA" },
      { label: "Motif", value: "Saisi deux fois" },
    ],
    actor_name: "Sam Mbappe",
    link_path: "/finance/receipts/abc",
  };

  it("dit ce qui s'est passé, qui l'a fait, et donne le lien pour vérifier", () => {
    const email = renderTransactionalEmail("owner_alert", "Paiement annulé : 50 000 FCFA", payload);
    expect(email.subject).toBe("Paiement annulé : 50 000 FCFA");
    expect(email.textContent).toContain("Un paiement a été annulé");
    expect(email.textContent).toContain("- Motif : Saisi deux fois");
    expect(email.textContent).toContain("- Par : Sam Mbappe");
    expect(email.textContent).toMatch(/Vérifier : https?:\/\/.+\/finance\/receipts\/abc/);
    // Les valeurs venant de la base sont échappées dans le HTML.
    expect(email.htmlContent).toContain("Agence &lt;Horizon&gt;");
    expect(email.htmlContent).not.toContain("Agence <Horizon>");
  });

  it("part au nom de SELECT Agency, pas de l'agence", () => {
    expect(PLATFORM_EMAIL_KINDS.has("owner_alert")).toBe(true);
  });
});
