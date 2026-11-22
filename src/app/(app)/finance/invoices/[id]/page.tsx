import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader, StatusBadge } from "@/components/shared/ui";
import { INVOICE_OVERDUE, INVOICE_STATUS } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { formatDay } from "@/features/invoices/document";
import { InvoiceDocument } from "@/features/invoices/InvoiceDocument";
import { InvoiceToolbar } from "@/features/invoices/InvoiceToolbar";
import { getInvoice } from "@/features/invoices/queries";
import { emailSendingEnabled } from "@/lib/email/brevo";

export const metadata: Metadata = { title: "Facture" };

export default function InvoicePage({ params, searchParams }: PageProps<"/finance/invoices/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Invoice params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Invoice({ params, searchParams }: PageProps<"/finance/invoices/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getInvoice(id);
  if (!detail) notFound();
  const { invoice: inv, client, travelCase, document, images, canWrite, canDelete, phoneDigits } = detail;
  const total = formatMoney(inv.totalMinor, inv.currency);
  const message = [
    `Bonjour ${client.firstName},`,
    `Veuillez trouver ci-joint votre facture ${inv.number} d'un montant de ${total}, à régler avant le ${formatDay(inv.dueDate)}.`,
    inv.paymentDetails && `Mode de paiement : ${inv.paymentDetails}`,
    "Merci de votre confiance.",
    document.issuer.name,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          back={{ href: "/finance/invoices", label: "Retour aux factures" }}
          eyebrow={<StatusBadge spec={document.overdue ? INVOICE_OVERDUE : INVOICE_STATUS[inv.status]} />}
          title={`Facture ${inv.number}`}
          description={
            <>
              <Link href={`/clients/${client.id}`} className="font-medium text-navy-700 hover:underline">
                {client.firstName} {client.lastName}
              </Link>
              {travelCase && (
                <>
                  {" · "}
                  <Link href={`/cases/${travelCase.id}?tab=finance`} className="font-medium text-navy-700 hover:underline">
                    {travelCase.reference}
                  </Link>
                </>
              )}
              {" · "}
              <span className="tabular-nums">{total}</span>
            </>
          }
        />
        {(query.ok === "facture-creee" || query.ok === "facture-modifiee") && (
          <div className="mb-4">
            <Notice tone="success" title={query.ok === "facture-creee" ? "Facture enregistrée" : "Facture modifiée"}>
              Elle est prête à imprimer, à télécharger en PDF ou à envoyer par WhatsApp.
            </Notice>
          </div>
        )}
        <div className="mb-6">
          <InvoiceToolbar
            directEmail={emailSendingEnabled()}
            email={client.email}
            invoiceId={inv.id}
            number={inv.number}
            status={inv.status}
            canWrite={canWrite}
            canDelete={canDelete}
            phoneDigits={phoneDigits}
            message={message}
          />
        </div>
      </div>

      <InvoiceDocument data={document} images={images} />

      <div className="mt-6 print:hidden">
        {/* Une facture ne crée ni paiement ni reçu : l'argent reçu s'enregistre dans le dossier, qui tient le reste à payer. */}
        {inv.status === "issued" && canWrite ? (
          <Notice title="Encaissement de cette facture">
            {travelCase ? (
              <>
                L&apos;argent reçu s&apos;enregistre dans le dossier {travelCase.reference} : il délivre un reçu numéroté et met à jour le reste à
                payer. Ensuite, marquez cette facture comme payée.
                <span className="mt-3 block">
                  <Button asChild variant="accent" size="sm">
                    <Link href={`/cases/${travelCase.id}?tab=finance&facture=${inv.id}#paiement`}>
                      <Wallet aria-hidden />
                      Enregistrer l&apos;encaissement
                    </Link>
                  </Button>
                </span>
              </>
            ) : (
              <>
                Cette facture n&apos;est liée à aucun dossier. Enregistrez l&apos;argent reçu dans le dossier du client concerné (onglet Finance) :
                c&apos;est lui qui délivre le reçu. Ensuite, marquez cette facture comme payée.{" "}
                <Link href={`/clients/${client.id}`} className="font-medium underline">
                  Voir les dossiers du client
                </Link>
              </>
            )}
          </Notice>
        ) : (
          <Notice>
            La facture est un document remis au client : marquer « payée » ne crée aucun reçu. L&apos;encaissement s&apos;enregistre dans le dossier
            (onglet Finance), qui délivre un reçu numéroté.
          </Notice>
        )}
      </div>
    </div>
  );
}
