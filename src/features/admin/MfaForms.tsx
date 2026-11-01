"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage } from "@/components/shared/form";
import { startEnrollmentAction, verifyCodeAction, type EnrollState } from "./mfa-actions";

function CodeForm({ factorId, submitLabel }: { factorId: string; submitLabel: string }) {
  const [state, action, pending] = useActionState(verifyCodeAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="factorId" value={factorId} />
      <FormField id="mfa-code" label="Code à 6 chiffres" required>
        <Input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" className="max-w-40 text-lg tracking-widest tabular-nums" />
      </FormField>
      <FormMessage message={state.message} />
      <Button type="submit" variant="accent" disabled={pending}>
        <ShieldCheck aria-hidden />
        {pending ? "Vérification…" : submitLabel}
      </Button>
    </form>
  );
}

// Selon la version du serveur, Supabase renvoie le SVG seul ou déjà sous forme d'adresse « data: ».
const qrSource = (qr: string) => (qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`);

/** Première configuration : QR code à scanner avec Google Authenticator, Microsoft Authenticator… */
export function EnrollTotp() {
  const [enrollment, setEnrollment] = useState<EnrollState>({});
  const [pending, startTransition] = useTransition();
  if (!enrollment.factorId) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="accent" disabled={pending} onClick={() => startTransition(async () => setEnrollment(await startEnrollmentAction()))}>
          <KeyRound aria-hidden />
          {pending ? "Préparation…" : "Configurer la double authentification"}
        </Button>
        <FormMessage message={enrollment.message} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Ouvrez une application d&apos;authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator…).</li>
        <li>Scannez ce QR code, ou saisissez la clé à la main.</li>
        <li>Saisissez le code à 6 chiffres affiché par l&apos;application.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR code SVG fourni par Supabase, pas une image optimisable */}
      <img src={qrSource(enrollment.qrCode ?? "")} alt="QR code de configuration de la double authentification" className="size-48 rounded-lg border border-slate-200 bg-white p-2" />
      <p className="text-sm text-slate-600">
        Clé : <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs break-all text-slate-800">{enrollment.secret}</code>
      </p>
      <CodeForm factorId={enrollment.factorId} submitLabel="Activer et ouvrir la console" />
    </div>
  );
}

/** Connexions suivantes : code de l'application déjà configurée. */
export function ChallengeTotp({ factorId }: { factorId: string }) {
  return <CodeForm factorId={factorId} submitLabel="Ouvrir la console" />;
}
