import { NextResponse } from "next/server";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { EXPENSE_RECEIPTS_BUCKET } from "@/features/finance/expense-receipts";

// Ouvre le justificatif d'une dépense : le bucket est privé, on redirige vers un lien signé valable 60 s,
// créé au nom de la personne connectée (la RLS de Storage s'applique aussi à cette demande).
export async function GET(_request: Request, { params }: RouteContext<"/finance/expenses/[id]/justificatif">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Justificatif introuvable.", { status: 404 });

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.read")) return new NextResponse("Votre rôle ne donne pas accès à la finance.", { status: 403 });

  const { data } = await ctx.supabase.from("expenses").select("receipt_path").eq("id", id).eq("organization_id", ctx.organizationId).maybeSingle();
  if (!data?.receipt_path) return new NextResponse("Justificatif introuvable.", { status: 404 });

  const { data: signed, error } = await ctx.supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).createSignedUrl(String(data.receipt_path), 60);
  if (error || !signed) return new NextResponse("Justificatif indisponible pour le moment.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
