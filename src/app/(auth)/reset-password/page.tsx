import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/AuthForms";
import { AuthHeading } from "@/features/auth/AuthHeading";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

// Atteinte par le lien de réinitialisation (/auth/confirm a ouvert la session) ; le proxy
// renvoie vers la connexion si aucune session n'est active.
export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="Nouveau mot de passe" description="Choisissez le mot de passe que vous utiliserez désormais pour vous connecter." />
      <ResetPasswordForm />
    </>
  );
}
