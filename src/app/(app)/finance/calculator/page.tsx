import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader, Section } from "@/components/shared/ui";
import { Calculator } from "@/features/finance/Calculator";
import { FIXED_PER_EURO } from "@/features/finance/currency-converter";
import { getEuroRates } from "@/features/finance/exchange-rates";
import { FinanceTabs } from "@/features/finance/FinanceTabs";
import { getShell } from "@/features/operations/queries";

export const metadata: Metadata = { title: "Calculatrice" };

// Calculatrice : aucune donnée de l'agence n'est enregistrée, tout se calcule dans le navigateur. Seuls les cours
// des devises (BCE) sont lus côté serveur, et gardés une heure.
export default function CalculatorPage() {
  return (
    <>
      <PageHeader
        title="Calculatrice"
        description="Pour vos calculs du quotidien sans quitter SELECT Agency : totaux, remises, commissions, pourcentages et conversion de devises."
      />
      <Suspense fallback={null}>
        <FinanceTabs />
      </Suspense>
      <Section title="Calculer">
        <Suspense fallback={<PageSkeleton />}>
          <CalculatorWithRates />
        </Suspense>
      </Section>
    </>
  );
}

async function CalculatorWithRates() {
  const [euroRates, { agency }] = await Promise.all([getEuroRates(), getShell()]);
  return <Calculator rates={euroRates?.rates ?? FIXED_PER_EURO} ratesDate={euroRates?.date} defaultCurrency={agency.currency} />;
}
