import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { loadBrandingImages } from "@/features/invoices/queries";
import { getReceipt } from "@/features/finance/queries";
import { renderReceiptPdf } from "@/features/finance/receipt-pdf";

// PDF du reçu (A4), créé à la demande au nom de la personne connectée : la RLS des paiements et
// des images s'applique. Un paiement encore à vérifier n'a pas de reçu. ?apercu=1 l'ouvre dans le navigateur.
export async function GET(request: NextRequest, { params }: RouteContext<"/finance/receipts/[id]/pdf">) {
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) return new NextResponse("Reçu introuvable.", { status: 404 });
  if (!receipt.document) return new NextResponse("Ce paiement est encore à vérifier : son reçu sera créé à la confirmation.", { status: 404 });

  const images = await loadBrandingImages(await getAgencyContext(), receipt.settings);
  const pdf = await renderReceiptPdf(receipt.document, images);
  const disposition = request.nextUrl.searchParams.get("apercu") === "1" ? "inline" : "attachment";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${receipt.document.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
