import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import type { InvoiceImageKind } from "@/lib/domain/types";
import { IMAGE_KINDS, imagePath } from "@/features/invoices/document";
import { renderInvoicePdf, type PdfImages } from "@/features/invoices/pdf";
import { getInvoice } from "@/features/invoices/queries";
import { BRANDING_BUCKET } from "@/features/invoices/storage";

// PDF de la facture, créé à la demande au nom de la personne connectée (la RLS de la facture et
// celle des images s'appliquent). Téléchargé par défaut ; ?apercu=1 l'ouvre dans le navigateur.
export async function GET(request: NextRequest, { params }: RouteContext<"/finance/invoices/[id]/pdf">) {
  const { id } = await params;
  const detail = await getInvoice(id);
  if (!detail) return new NextResponse("Facture introuvable.", { status: 404 });

  const ctx = await getAgencyContext();
  const images: PdfImages = {};
  await Promise.all(
    IMAGE_KINDS.map(async (kind: InvoiceImageKind) => {
      const path = imagePath(detail.settings, kind);
      if (!path) return;
      const { data } = await ctx.supabase.storage.from(BRANDING_BUCKET).download(path);
      if (data) images[kind] = new Uint8Array(await data.arrayBuffer());
    }),
  );

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
