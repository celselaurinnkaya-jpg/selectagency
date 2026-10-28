import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/AuthForms";
import { AuthHeading } from "@/features/auth/AuthHeading";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Mot de passe oublié" description="Indiquez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe." />
      <div className="space-y-5">
        <ForgotPasswordForm />
        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-navy-700 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </>
  );
}
