import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { getCaseSummaryDocument } from "@/features/cases/queries";
import { loadBrandingImages } from "@/features/invoices/queries";
import { renderSpecPdf } from "@/features/printables/spec-pdf";

// PDF du récapitulatif de dossier (A4). ?finances=1 ajoute la situation financière (si le rôle le permet).
export async function GET(request: NextRequest, { params }: RouteContext<"/cases/[id]/recapitulatif/pdf">) {
  const { id } = await params;
  const doc = await getCaseSummaryDocument(id, request.nextUrl.searchParams.get("finances") === "1");
  if (!doc) return new NextResponse("Dossier introuvable.", { status: 404 });
  const pdf = await renderSpecPdf(doc.spec, await loadBrandingImages(await getAgencyContext(), doc.settings));
  const disposition = request.nextUrl.searchParams.get("apercu") === "1" ? "inline" : "attachment";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="Recapitulatif-${doc.travelCase.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
