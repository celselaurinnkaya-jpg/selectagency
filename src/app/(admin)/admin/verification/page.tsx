import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader } from "@/components/shared/ui";
import { getPlatformAccess } from "@/lib/auth/platform";
import { ChallengeTotp, EnrollTotp } from "@/features/admin/MfaForms";

export const metadata: Metadata = { title: "Double authentification" };

export default function VerificationPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow={
          <span className="flex size-10 items-center justify-center rounded-lg bg-navy-800 text-citron-400">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
        }
        title="Double authentification"
        description="La console donne accès à toutes les agences inscrites : un code de votre téléphone est demandé en plus du mot de passe."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Verification />
      </Suspense>
    </div>
  );
}

async function Verification() {
  const { user, access } = await getPlatformAccess();
  if (!user) redirect("/login?next=/admin");
  if (access === "none") notFound();
  if (access === "ok") redirect("/admin");

  const { data } = await user.supabase.auth.mfa.listFactors();
  const factor = data?.totp?.[0];
  return (
    <div className="space-y-4">
      <Card>{factor ? <ChallengeTotp factorId={factor.id} /> : <EnrollTotp />}</Card>
      <Notice>
        Si vous perdez votre téléphone, un autre administrateur SELECT peut retirer votre facteur depuis le tableau de bord Supabase
        (Authentication &gt; Users). L&apos;équipe SELECT ne demande jamais ce code par message.
      </Notice>
    </div>
  );
}
