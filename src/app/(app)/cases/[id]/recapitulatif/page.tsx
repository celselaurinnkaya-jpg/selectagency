import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getCaseSummaryDocument } from "@/features/cases/queries";
import { DocumentToolbar } from "@/features/printables/DocumentToolbar";
import { PrintableDocument } from "@/features/printables/PrintableDocument";
import { emailSendingEnabled } from "@/lib/email/brevo";

export const metadata: Metadata = { title: "Récapitulatif du dossier" };

export default function CaseSummaryPage({ params, searchParams }: PageProps<"/cases/[id]/recapitulatif">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Summary params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Summary({ params, searchParams }: PageProps<"/cases/[id]/recapitulatif">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const doc = await getCaseSummaryDocument(id, query.finances === "1");
  if (!doc) notFound();
  const { travelCase: c, client, spec, images, canSeeFinance, withFinance, phoneDigits, email } = doc;
  const base = `/cases/${c.id}/recapitulatif`;
  const message = [
    `Bonjour ${client.firstName},`,
    `Veuillez trouver ci-joint le point sur votre dossier ${c.reference} (${c.title}).`,
    "Nous restons à votre disposition pour toute question.",
    spec.issuer.name,
  ].join("\n\n");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          back={{ href: `/cases/${c.id}`, label: "Retour au dossier" }}
          title={`Récapitulatif du dossier ${c.reference}`}
          description="Document à remettre au client : où en est la démarche, les pièces et les rendez-vous."
        />
        {canSeeFinance && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              {withFinance
                ? "La situation financière (convenu, payé, reste à payer) figure sur ce document."
                : "La situation financière n'y figure pas : utile pour remettre le document à un tiers."}
            </p>
            <Button asChild variant="outline">
              <Link href={withFinance ? base : `${base}?finances=1`} replace scroll={false}>
                <Wallet aria-hidden />
                {withFinance ? "Retirer la situation financière" : "Inclure la situation financière"}
              </Link>
            </Button>
          </div>
        )}
        <div className="mb-6">
          <DocumentToolbar
            directEmail={emailSendingEnabled()}
            withFinance={withFinance}
            kind="case"
            id={c.id}
            pdfUrl={`/cases/${c.id}/recapitulatif/pdf${withFinance ? "?finances=1" : ""}`}
            number={`Recapitulatif-${c.reference}`}
            phoneDigits={phoneDigits}
            email={email}
            message={message}
            subject={`Point sur votre dossier ${c.reference} — ${spec.issuer.name}`}
          />
        </div>
        {!canSeeFinance && <Notice>Votre rôle ne permet pas d&apos;ajouter la situation financière à ce document.</Notice>}
      </div>
      <PrintableDocument spec={spec} images={images} />
    </div>
  );
}
