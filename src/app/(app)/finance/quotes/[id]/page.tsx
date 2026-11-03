import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader, StatusBadge } from "@/components/shared/ui";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { DocumentToolbar } from "@/features/printables/DocumentToolbar";
import { PrintableDocument } from "@/features/printables/PrintableDocument";
import { getQuote } from "@/features/quotes/queries";
import { QuoteStatusButtons } from "@/features/quotes/QuoteForms";
import { emailSendingEnabled } from "@/lib/email/brevo";

export const metadata: Metadata = { title: "Devis" };

export default function QuotePage({ params }: PageProps<"/finance/quotes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Quote params={params} />
    </Suspense>
  );
}

async function Quote({ params }: Pick<PageProps<"/finance/quotes/[id]">, "params">) {
  const { id } = await params;
  const detail = await getQuote(id);
  if (!detail) notFound();
  const { quote: q, total, agency, travelCase, client, spec, images, canWrite, phoneDigits, email } = detail;
  const amount = formatMoney(total, q.currency);
  const message = [
    `Bonjour ${client.firstName},`,
    `Veuillez trouver ci-joint notre devis ${q.reference} d'un montant de ${amount}${q.validUntil ? `, valable jusqu'au ${formatDate(q.validUntil, agency.timezone)}` : ""}.`,
    "Nous restons à votre disposition pour toute question.",
    spec.issuer.name,
  ].join("\n\n");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          back={{ href: `/cases/${travelCase.id}?tab=finance`, label: "Retour au dossier" }}
          eyebrow={<StatusBadge spec={QUOTE_STATUS[q.status]} />}
          title={`Devis ${q.reference}`}
          description={
            <>
              <Link href={`/clients/${client.id}`} className="font-medium text-navy-700 hover:underline">
                {client.firstName} {client.lastName}
              </Link>
              {" · "}
              <span className="tabular-nums">{amount}</span>
            </>
          }
        />
        <div className="mb-4">
          <DocumentToolbar
            directEmail={emailSendingEnabled()}
            kind="quote"
            id={q.id}
            pdfUrl={`/finance/quotes/${q.id}/pdf`}
            number={q.reference}
            voided={q.status === "cancelled" || q.status === "refused"}
            phoneDigits={phoneDigits}
            email={email}
            message={message}
            subject={`Devis ${q.reference} — ${spec.issuer.name}`}
          />
        </div>
        {canWrite && (
          <div className="mb-6">
            <QuoteStatusButtons quoteId={q.id} status={q.status} />
          </div>
        )}
      </div>
      <PrintableDocument spec={spec} images={images} />
    </div>
  );
}
