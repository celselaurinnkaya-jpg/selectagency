import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { loadBrandingImages } from "@/features/invoices/queries";
import { renderSpecPdf } from "@/features/printables/spec-pdf";
import { getQuote } from "@/features/quotes/queries";

// PDF du devis (A4), créé à la demande au nom de la personne connectée. ?apercu=1 l'ouvre dans le navigateur.
export async function GET(request: NextRequest, { params }: RouteContext<"/finance/quotes/[id]/pdf">) {
  const { id } = await params;
  const detail = await getQuote(id);
  if (!detail) return new NextResponse("Devis introuvable.", { status: 404 });
  const pdf = await renderSpecPdf(detail.spec, await loadBrandingImages(await getAgencyContext(), detail.settings));
  const disposition = request.nextUrl.searchParams.get("apercu") === "1" ? "inline" : "attachment";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${detail.quote.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
