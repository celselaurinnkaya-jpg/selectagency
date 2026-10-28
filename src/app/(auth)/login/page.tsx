import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/shared/ui";
import { LoginForm } from "@/features/auth/AuthForms";
import { AuthHeading } from "@/features/auth/AuthHeading";
import { safeNext } from "@/features/auth/redirects";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <AuthHeading title="Connexion" description="Accédez à l'espace de travail de votre agence." />
      <Suspense fallback={<div className="h-72" />}>
        <Login searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? safeNext(query.next, "") : "";
  return (
    <div className="space-y-5">
      {query.erreur === "lien" && (
        <Notice tone="warning" title="Lien expiré ou déjà utilisé">
          Connectez-vous, ou demandez un nouveau lien depuis « Mot de passe oublié ».
        </Notice>
      )}
      <LoginForm next={next || undefined} />
      <p className="text-center text-sm text-slate-600">
        Pas encore de compte ?{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-medium text-navy-700 hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
