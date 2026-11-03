import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/shared/ui";
import { getSessionUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { AuthHeading } from "@/features/auth/AuthHeading";
import { AcceptPartnerAccess } from "@/features/partners/AcceptPartnerAccess";

export const metadata: Metadata = { title: "Espace partenaire" };

export default function PartnerAccessPage({ params }: PageProps<"/acces-partenaire/[token]">) {
  return (
    <>
      <AuthHeading title="Espace partenaire" description="Suivez les clients que vous avez recommandés et vos commissions." />
      <Suspense fallback={<div className="h-48" />}>
        <Access params={params} />
      </Suspense>
    </>
  );
}

async function Access({ params }: Pick<PageProps<"/acces-partenaire/[token]">, "params">) {
  const { token } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("get_partner_access", { p_token: token }) : { data: null };
  const access = (data as { agency_name: string; partner_name: string; email: string }[] | null)?.[0];
  if (!access) {
    return (
      <Notice tone="warning" title="Lien introuvable ou déjà utilisé">
        Si vous avez déjà ouvert votre espace, connectez-vous simplement. Sinon, demandez un nouveau lien à l&apos;agence.
      </Notice>
    );
  }

  const user = await getSessionUser();
  const here = `/acces-partenaire/${token}`;
  return (
    <Card className="space-y-4">
      <p className="text-sm text-slate-700">
        <strong className="text-slate-900">{access.agency_name}</strong> vous ouvre un espace partenaire au nom de{" "}
        <strong className="text-slate-900">{access.partner_name}</strong>, en lecture seule.
      </p>
      <p className="text-sm text-slate-600">
        Accès réservé à l&apos;adresse <strong className="text-slate-900">{access.email}</strong>.
      </p>
      {!user ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="accent">
            <Link href={`/signup?email=${encodeURIComponent(access.email)}&next=${encodeURIComponent(here)}`}>Créer mon compte</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>J&apos;ai déjà un compte</Link>
          </Button>
        </div>
      ) : user.email.toLowerCase() === access.email ? (
        <AcceptPartnerAccess token={token} />
      ) : (
        <Notice tone="warning">
          Vous êtes connecté avec {user.email}. Déconnectez-vous, puis connectez-vous ou créez un compte avec {access.email}.
        </Notice>
      )}
    </Card>
  );
}
