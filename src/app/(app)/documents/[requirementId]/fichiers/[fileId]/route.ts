import { NextResponse, type NextRequest } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { DOCUMENTS_BUCKET } from "@/features/documents/storage";

// Ouvre (ou télécharge, avec ?telecharger=1) un fichier d'une pièce. Le bucket est privé : on
// redirige vers un lien signé valable 60 s, créé au nom de la personne connectée (la RLS de
// document_files et celle de Storage s'appliquent à cette demande).
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest, { params }: RouteContext<"/documents/[requirementId]/fichiers/[fileId]">) {
  const { requirementId, fileId } = await params;
  if (!UUID.test(requirementId) || !UUID.test(fileId)) return new NextResponse("Fichier introuvable.", { status: 404 });

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "documents.read")) return new NextResponse("Votre rôle ne donne pas accès aux documents.", { status: 403 });

  const { data } = await ctx.supabase
    .from("document_files")
    .select("storage_path, file_name")
    .eq("id", fileId)
    .eq("requirement_id", requirementId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!data) return new NextResponse("Fichier introuvable.", { status: 404 });

  const download = request.nextUrl.searchParams.get("telecharger") === "1";
  const { data: signed, error } = await ctx.supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(String(data.storage_path), 60, download ? { download: String(data.file_name) } : undefined);
  if (error || !signed) return new NextResponse("Fichier indisponible pour le moment.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
