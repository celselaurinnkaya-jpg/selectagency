import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { InvoiceEditor } from "@/features/invoices/InvoiceEditor";
import { getInvoiceEditor } from "@/features/invoices/queries";

export const metadata: Metadata = { title: "Nouvelle facture" };

export default function NewInvoicePage({ searchParams }: PageProps<"/finance/invoices/new">) {
  return (
    <>
      <PageHeader
        back={{ href: "/finance/invoices", label: "Retour aux factures" }}
        title="Nouvelle facture"
        description="Remplissez la facture : l'aperçu montre exactement ce que recevra le client. Logo, cachet et signature viennent de Paramètres > Factures."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Editor searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Editor({ searchParams }: Pick<PageProps<"/finance/invoices/new">, "searchParams">) {
  const { client, dossier } = await searchParams;
  const editor = await getInvoiceEditor({
    clientId: typeof client === "string" ? client : undefined,
    caseId: typeof dossier === "string" ? dossier : undefined,
  });
  if (!editor) return null;
  if ("forbidden" in editor) return <Notice>{editor.forbidden}</Notice>;
  return (
    <InvoiceEditor
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
  );
}
