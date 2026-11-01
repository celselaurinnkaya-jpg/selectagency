import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import type { InvoiceImageKind } from "@/lib/domain/types";
import { IMAGE_KINDS, imagePath } from "@/features/invoices/document";
import { loadInvoiceSettings } from "@/features/invoices/queries";
import { BRANDING_BUCKET } from "@/features/invoices/storage";

// Logo, cachet ou signature de l'agence, lus au nom de la personne connectée (bucket privé : le
// cachet et la signature ne doivent jamais avoir d'adresse publique). L'adresse porte le nom du
// fichier (?v=…) : une nouvelle image change d'adresse, l'ancienne peut rester en cache.
export async function GET(request: NextRequest, { params }: RouteContext<"/finance/invoices/images/[kind]">) {
  const { kind } = await params;
  if (!IMAGE_KINDS.includes(kind as InvoiceImageKind)) return new NextResponse("Image introuvable.", { status: 404 });

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.read")) return new NextResponse("Votre rôle ne donne pas accès aux factures.", { status: 403 });
  const path = imagePath(await loadInvoiceSettings(ctx), kind as InvoiceImageKind);
  if (!path) return new NextResponse("Image introuvable.", { status: 404 });

  const { data, error } = await ctx.supabase.storage.from(BRANDING_BUCKET).download(path);
  if (error || !data) return new NextResponse("Image indisponible pour le moment.", { status: 404 });
  const current = request.nextUrl.searchParams.get("v") === path.split("/").pop();
  return new NextResponse(data, {
    headers: {
      "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
