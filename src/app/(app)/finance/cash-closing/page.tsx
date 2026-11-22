import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";
import { CashClosingForm } from "@/features/finance/CashClosingForm";
import { getCashClosingData } from "@/features/finance/cash-closing-queries";

export const metadata: Metadata = { title: "Clôture de caisse" };

export default async function CashClosingPage({ searchParams }: PageProps<"/finance">) {
  const query = await searchParams;
  const targetDate = typeof query.date === "string" ? query.date : undefined;

  return (
    <>
      <PageHeader
        title="Clôture de caisse"
        description="Arrêt journalier des encaissements physiques et électroniques : contrôle des espèces réelles, détection des écarts et traçabilité."
      />
      <FinanceTabs />
      <Suspense fallback={<PageSkeleton />}>
        <CashClosingContent targetDate={targetDate} />
      </Suspense>
    </>
  );
}

async function CashClosingContent({ targetDate }: { targetDate?: string }) {
  const data = await getCashClosingData(targetDate);

  if (!data.canSeeFinance) {
    return <FinanceRestricted />;
  }

  return (
    <CashClosingForm
      summary={data.summary}
      closings={data.closings}
      currency={data.currency}
      timeZone={data.tz}
      canWrite={data.canWrite}
    />
  );
}
