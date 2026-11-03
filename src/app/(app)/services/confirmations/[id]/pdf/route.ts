import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { loadBrandingImages } from "@/features/invoices/queries";
import { renderSpecPdf } from "@/features/printables/spec-pdf";
import { getBookingDocument } from "@/features/services/queries";

// PDF de la confirmation de réservation (A4). ?apercu=1 l'ouvre dans le navigateur.
export async function GET(request: NextRequest, { params }: RouteContext<"/services/confirmations/[id]/pdf">) {
  const { id } = await params;
  const doc = await getBookingDocument(id);
  if (!doc) return new NextResponse("Confirmation introuvable.", { status: 404 });
  const pdf = await renderSpecPdf(doc.spec, await loadBrandingImages(await getAgencyContext(), doc.settings));
  const disposition = request.nextUrl.searchParams.get("apercu") === "1" ? "inline" : "attachment";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${doc.booking.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
