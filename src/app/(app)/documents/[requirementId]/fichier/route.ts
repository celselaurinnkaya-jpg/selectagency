import { NextResponse } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { DOCUMENTS_BUCKET } from "@/features/documents/storage";

// Ouvre le fichier d'une pièce : le bucket est privé, on redirige vers un lien signé valable 60 s,
// créé au nom de la personne connectée (la RLS de Storage s'applique aussi à cette demande).
export async function GET(_request: Request, { params }: RouteContext<"/documents/[requirementId]/fichier">) {
  const { requirementId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(requirementId)) return new NextResponse("Fichier introuvable.", { status: 404 });

  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "documents.read")) return new NextResponse("Votre rôle ne donne pas accès aux documents.", { status: 403 });

  const { data } = await ctx.supabase.from("document_requirements").select("storage_path").eq("id", requirementId).maybeSingle();
  if (!data?.storage_path) return new NextResponse("Fichier introuvable.", { status: 404 });

  const { data: signed, error } = await ctx.supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(String(data.storage_path), 60);
  if (error || !signed) return new NextResponse("Fichier indisponible pour le moment.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
