import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { InvoiceEditor } from "@/features/invoices/InvoiceEditor";
import { getInvoiceEditor } from "@/features/invoices/queries";

export const metadata: Metadata = { title: "Modifier la facture" };

export default function EditInvoicePage({ params }: PageProps<"/finance/invoices/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/finance/invoices/[id]/edit">, "params">) {
  const { id } = await params;
  const editor = await getInvoiceEditor({ invoiceId: id });
  if (!editor) notFound();
  const back = { href: `/finance/invoices/${id}`, label: "Retour à la facture" };
  if ("forbidden" in editor) {
    return (
      <>
        <PageHeader back={back} title="Modifier la facture" />
        <Notice>{editor.forbidden}</Notice>
      </>
    );
  }
  const invoice = editor.invoice!;
  return (
    <>
      <PageHeader back={back} title={`Modifier la facture ${invoice.number}`} />
      {invoice.status === "draft" || invoice.status === "issued" ? (
        <InvoiceEditor
          invoice={invoice}
          clients={editor.clients}
          cases={editor.cases}
          defaults={editor.defaults}
          issuer={editor.issuer}
          images={editor.images}
          footerNote={editor.settings.footerNote || undefined}
          signatoryName={editor.settings.signatoryName || undefined}
          isDemo={editor.isDemo}
          services={editor.services}
        />
      ) : (
        <Notice tone="warning">
          {invoice.status === "paid"
            ? "Cette facture est payée : elle est verrouillée. Remettez-la « à payer » depuis sa page pour la corriger."
            : "Cette facture est annulée : elle ne se modifie plus. Créez une nouvelle facture si nécessaire."}
        </Notice>
      )}
    </>
  );
}
