import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/features/auth/AuthForms";
import { AuthHeading } from "@/features/auth/AuthHeading";
import { safeNext } from "@/features/auth/redirects";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <>
      <AuthHeading
        title="Créer un compte"
        description="Votre compte personnel. Vous créerez ensuite votre agence, ou rejoindrez celle qui vous a invité."
      />
      <Suspense fallback={<div className="h-80" />}>
        <Signup searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Signup({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? safeNext(query.next, "") : "";
  const email = typeof query.email === "string" ? query.email : undefined;
  return (
    <div className="space-y-5">
      <SignupForm next={next || undefined} email={email} />
      <p className="text-center text-sm text-slate-600">
        Déjà un compte ?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-navy-700 hover:underline">
          Se connecter
        </Link>
      </p>
      <p className="text-xs text-slate-500">
        En créant un compte, vous acceptez que les données saisies soient hébergées par Supabase pour le compte de votre agence.
      </p>
    </div>
  );
}
