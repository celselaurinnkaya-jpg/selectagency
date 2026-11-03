import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/shared/ui";
import { PAYMENT_STATUS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { PendingPaymentActions, VoidPaymentForm } from "@/features/finance/FinanceForms";
import { getReceipt } from "@/features/finance/queries";
import { chargeNature } from "@/features/finance/receipt";
import { ReceiptDocument } from "@/features/finance/ReceiptDocument";
import { DocumentToolbar } from "@/features/printables/DocumentToolbar";
import { emailSendingEnabled } from "@/lib/email/brevo";

export const metadata: Metadata = { title: "Reçu de paiement" };

export default function ReceiptPage({ params }: PageProps<"/finance/receipts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: Pick<PageProps<"/finance/receipts/[id]">, "params">) {
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) notFound();
  const { payment: p, agency, client, travelCase, document, images, canVoid, canConfirm, receivedBy, lines, phoneDigits, email } = receipt;
  const tz = agency.timezone;
  const amount = formatMoney(p.amountMinor, p.currency);
  const back = { href: "/finance/payments", label: "Retour aux paiements" };
  const context = (
    <>
      <Link href={`/clients/${client.id}?tab=paiements`} className="font-medium text-navy-700 hover:underline">
        {client.firstName} {client.lastName}
      </Link>
      {" · "}
      <Link href={`/cases/${travelCase.id}?tab=finance`} className="font-medium text-navy-700 hover:underline">
        {travelCase.reference}
      </Link>
      {" · "}
      <span className="tabular-nums">{amount}</span>
    </>
  );

  // Paiement annoncé, pas encore vérifié : aucun reçu tant que la réception n'est pas confirmée.
  if (!document) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader back={back} eyebrow={<StatusBadge spec={PAYMENT_STATUS[p.status]} />} title={p.status === "pending" ? "Paiement à vérifier" : "Paiement annulé"} description={context} />
        {p.status === "pending" ? (
          <Notice tone="warning" title="Pas encore de reçu">
            Vérifiez que l&apos;argent est bien arrivé (caisse, compte bancaire ou Mobile Money). Une fois la réception confirmée, le paiement compte dans
            les soldes et le reçu numéroté est créé.
          </Notice>
        ) : (
          <Notice tone="info" title="Annulé avant vérification">
            Ce paiement annoncé n&apos;a jamais été confirmé : aucun reçu n&apos;a été créé.
            {p.voidReason && ` Motif : ${p.voidReason}.`}
          </Notice>
        )}
        <Card className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Montant annoncé" value={<span className="tabular-nums">{amount}</span>} />
            <Fact label="Date indiquée" value={formatDate(p.paidAt, tz, "dateTime")} />
            <Fact label="Moyen de paiement" value={p.transactionReference ? `${p.methodLabel} — réf. ${p.transactionReference}` : p.methodLabel} />
            {p.payerName && <Fact label="Payé par" value={p.payerName} />}
            <Fact label="Saisi par" value={receivedBy?.fullName ?? "—"} />
            <Fact label="Dossier" value={`${travelCase.reference} — ${travelCase.title}`} />
          </dl>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm">
            {lines.map((line) => (
              <li key={line.chargeId} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-slate-900">{line.charge?.label ?? "Prestation"}</span>
                  <span className="block text-xs text-slate-500">{chargeNature(line.charge)}</span>
                </span>
                <span className="tabular-nums text-slate-900">{formatMoney(line.amountMinor, p.currency)}</span>
              </li>
            ))}
          </ul>
          {canConfirm && <PendingPaymentActions paymentId={p.id} />}
        </Card>
      </div>
    );
  }

  const message = [
    `Bonjour ${client.firstName},`,
    `Nous confirmons la réception de votre paiement de ${amount} (${document.method}) le ${document.paidAtLabel}.`,
    `Veuillez trouver ci-joint votre reçu ${document.number}.`,
    "Merci de votre confiance.",
    document.issuer.name,
  ].join("\n\n");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <PageHeader back={back} eyebrow={<StatusBadge spec={PAYMENT_STATUS[p.status]} />} title={`Reçu ${document.number}`} description={context} />
        <div className="mb-6">
          <DocumentToolbar
            directEmail={emailSendingEnabled()}
            kind="receipt"
            id={p.id}
            pdfUrl={`/finance/receipts/${p.id}/pdf`}
            number={document.number}
            voided={p.status === "voided"}
            phoneDigits={phoneDigits}
            email={email}
            message={message}
            subject={`Reçu ${document.number} — ${document.issuer.name}`}
          />
        </div>
      </div>

      <ReceiptDocument data={document} images={images} />

      {canVoid && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
          <VoidPaymentForm paymentId={p.id} />
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium break-words text-slate-900">{value}</dd>
    </div>
  );
}
