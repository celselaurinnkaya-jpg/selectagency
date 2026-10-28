"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage message={state.message} />
      <FormField id="email" label="Adresse e-mail" required error={e.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} {...describedBy("email", e.email)} />
      </FormField>
      <FormField id="password" label="Mot de passe" required error={e.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" {...describedBy("password", e.password)} />
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-navy-700 hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}

export function SignupForm({ next, email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState(signUpAction, initialFormState);
  const e = state.fieldErrors ?? {};
  if (state.ok) return <FormMessage message={state.message} tone="success" />;
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage message={state.message} />
      <FormField id="fullName" label="Nom complet" required error={e.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" defaultValue={state.values?.fullName} {...describedBy("fullName", e.fullName)} />
      </FormField>
      <FormField id="email" label="Adresse e-mail" required error={e.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? email} {...describedBy("email", e.email)} />
      </FormField>
      <FormField id="password" label="Mot de passe" required error={e.password} hint="Au moins 8 caractères, en mélangeant lettres et chiffres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" {...describedBy("password", e.password, "hint")} />
      </FormField>
      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialFormState);
  const e = state.fieldErrors ?? {};
  if (state.ok) return <FormMessage message={state.message} tone="success" />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage message={state.message} />
      <FormField id="email" label="Adresse e-mail du compte" required error={e.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} {...describedBy("email", e.email)} />
      </FormField>
      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Envoi…" : "Recevoir un lien de réinitialisation"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage message={state.message} />
      <FormField id="password" label="Nouveau mot de passe" required error={e.password} hint="Au moins 8 caractères.">
        <Input id="password" name="password" type="password" autoComplete="new-password" {...describedBy("password", e.password, "hint")} />
      </FormField>
      <FormField id="confirm" label="Confirmez le mot de passe" required error={e.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" {...describedBy("confirm", e.confirm)} />
      </FormField>
      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
