import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getBookingDocument } from "@/features/services/queries";
import { BookingActions } from "@/features/services/BookingForms";
import { DocumentToolbar } from "@/features/printables/DocumentToolbar";
import { PrintableDocument } from "@/features/printables/PrintableDocument";
import { emailSendingEnabled } from "@/lib/email/brevo";

export const metadata: Metadata = { title: "Confirmation de réservation" };

export default function BookingPage({ params, searchParams }: PageProps<"/services/confirmations/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Booking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Booking({ params, searchParams }: PageProps<"/services/confirmations/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const doc = await getBookingDocument(id);
  if (!doc) notFound();
  const { booking: b, service, client, link, agency, spec, images, canEdit, phoneDigits, email } = doc;
  const backTo = `/services/${service.id}`;
  const message = [
    `Bonjour ${client.firstName},`,
    `Votre réservation est confirmée (${service.name}${b.provider ? `, ${b.provider}` : ""}${b.reference ? `, référence ${b.reference}` : ""}).`,
    `Veuillez trouver ci-joint la confirmation ${b.number}.`,
    spec.issuer.name,
  ].join("\n\n");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          back={{ href: backTo, label: `Retour au service « ${service.name} »` }}
          title={`Confirmation ${b.number}`}
          description={
            <Link href={`/clients/${client.id}?tab=services`} className="font-medium text-navy-700 hover:underline">
              {client.firstName} {client.lastName}
            </Link>
          }
        />
        {(query.ok === "creee" || query.ok === "modifiee") && (
          <div className="mb-4">
            <Notice tone="success" title={query.ok === "creee" ? "Confirmation créée" : "Confirmation modifiée"}>
              Elle est prête à imprimer, à télécharger en PDF ou à envoyer au client.
            </Notice>
          </div>
        )}
        <div className="mb-4">
          <DocumentToolbar
            directEmail={emailSendingEnabled()}
            kind="booking"
            id={b.id}
            pdfUrl={`/services/confirmations/${b.id}/pdf`}
            number={b.number}
            phoneDigits={phoneDigits}
            email={email}
            message={message}
            subject={`Confirmation de réservation ${b.number} — ${spec.issuer.name}`}
          />
        </div>
        {canEdit && (
          <div className="mb-6">
            <BookingActions booking={b} linkId={link.id} defaultCurrency={agency.currency} backTo={backTo} />
          </div>
        )}
      </div>
      <PrintableDocument spec={spec} images={images} />
    </div>
  );
}
