import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { renderInvoicePdf } from "@/features/invoices/pdf";
import { getInvoice, loadBrandingImages } from "@/features/invoices/queries";

// PDF de la facture, créé à la demande au nom de la personne connectée (la RLS de la facture et
// celle des images s'appliquent). Téléchargé par défaut ; ?apercu=1 l'ouvre dans le navigateur.
export async function GET(request: NextRequest, { params }: RouteContext<"/finance/invoices/[id]/pdf">) {
  const { id } = await params;
  const detail = await getInvoice(id);
  if (!detail) return new NextResponse("Facture introuvable.", { status: 404 });

  const images = await loadBrandingImages(await getAgencyContext(), detail.settings);
  const pdf = await renderInvoicePdf(detail.document, images);
  const disposition = request.nextUrl.searchParams.get("apercu") === "1" ? "inline" : "attachment";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${detail.invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
