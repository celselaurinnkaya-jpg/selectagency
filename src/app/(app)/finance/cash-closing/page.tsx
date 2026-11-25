import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";
import { CashClosingForm } from "@/features/finance/CashClosingForm";
import { getCashClosingData } from "@/features/finance/cash-closing-queries";
import { Pills } from "@/components/shared/navigation";

export const metadata: Metadata = { title: "Clôture de caisse" };

export default function CashClosingPage({ searchParams }: PageProps<"/finance">) {
  return (
    <>
      <PageHeader
        title="Clôture de caisse"
        description="Arrêt journalier des encaissements physiques et électroniques : contrôle des espèces réelles, détection des écarts et traçabilité."
      />
      <FinanceTabs />
      <Suspense fallback={<PageSkeleton />}>
        <CashClosingContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CashClosingContent({ searchParams }: Pick<PageProps<"/finance">, "searchParams">) {
  const query = await searchParams;
  const targetDate = typeof query.date === "string" ? query.date : undefined;
  const data = await getCashClosingData(targetDate, typeof query.bureau === "string" ? query.bureau : undefined);
  const href = (bureau?: string) => {
    const search = new URLSearchParams();
    if (targetDate) search.set("date", targetDate);
    if (bureau) search.set("bureau", bureau);
    const text = search.toString();
    return `/finance/cash-closing${text ? `?${text}` : ""}`;
  };

  if (!data.canSeeFinance) {
    return <FinanceRestricted />;
  }

  return (
    <>
      {data.bureaux.length > 0 && (
        <Pills
          label="Caisse"
          active={data.bureau ?? "agence"}
          items={[
            { key: "agence", label: "Toute l'agence", href: href() },
            ...data.bureaux.filter((b) => !b.archived || b.id === data.bureau).map((b) => ({ key: b.id, label: `${b.code} — ${b.name}`, href: href(b.id) })),
          ]}
        />
      )}
      <CashClosingForm
        key={data.bureau ?? "agence"}
        summary={data.summary}
        closings={data.closings}
        currency={data.currency}
        timeZone={data.tz}
        canWrite={data.canWrite}
        bureauId={data.bureau}
        bureauNames={Object.fromEntries(data.bureaux.map((b) => [b.id, b.name]))}
      />
    </>
  );
}
