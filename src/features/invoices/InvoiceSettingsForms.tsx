"use client";

/* eslint-disable @next/next/no-img-element -- images privées servies par l'application */
import { useActionState, useRef, useState, useTransition } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage } from "@/components/shared/form";
import type { InvoiceImageKind, InvoiceSettings } from "@/lib/domain/types";
import { initialFormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/browser";
import { IMAGE_LABELS } from "./document";
import { saveInvoiceSettingsAction, setInvoiceImageAction } from "./settings-actions";
import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_IMAGE_TYPES, BRANDING_BUCKET, brandingPath, MAX_IMAGE_BYTES } from "./storage";

const HINTS: Record<InvoiceImageKind, string> = {
  logo: "En haut à droite de chaque facture.",
  stamp: "Apposé sous la signature. Une image PNG à fond transparent rend mieux.",
  signature: "Signature manuscrite scannée ou photographiée, de préférence en PNG à fond transparent.",
};

/**
 * Envoi d'une image des factures : le navigateur dépose le fichier dans le stockage privé de
 * l'agence, puis le serveur l'enregistre et efface l'ancienne image.
 */
export function BrandingImageField({ organizationId, kind, url }: { organizationId: string; kind: InvoiceImageKind; url?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const label = IMAGE_LABELS[kind];

  function send(file: File) {
    setMessage(null);
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setMessage({ text: "Format non accepté ou image de plus de 2 Mo. Envoyez une image PNG ou JPEG.", tone: "error" });
      return;
    }
    startTransition(async () => {
      const path = brandingPath(organizationId, kind, file.type);
      const { error } = await createClient().storage.from(BRANDING_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setMessage({ text: "L'envoi a échoué. Vérifiez votre connexion internet, puis réessayez.", tone: "error" });
      } else {
        const result = await setInvoiceImageAction({ kind, path });
        setMessage({ text: result.message, tone: result.ok ? "success" : "error" });
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function remove() {
    setMessage(null);
    startTransition(async () => {
      const result = await setInvoiceImageAction({ kind, path: "" });
      setMessage({ text: result.message, tone: result.ok ? "success" : "error" });
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
      <div>
        <h3 className="font-semibold text-navy-800">{label}</h3>
        <p className="text-xs text-slate-500">{HINTS[kind]}</p>
      </div>
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-[repeating-conic-gradient(#f3f5f8_0%_25%,#fff_0%_50%)] bg-size-[16px_16px] p-2">
        {url ? <img src={url} alt={`${label} actuel`} className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-slate-500">Aucune image</span>}
      </div>
      <input
        ref={inputRef}
        id={`image-${kind}`}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
        }}
      />
      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()} aria-label={`${url ? "Remplacer" : "Envoyer"} : ${label}`}>
          <ImageUp aria-hidden />
          {pending ? "Envoi…" : url ? "Remplacer" : "Envoyer une image"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remove} aria-label={`Retirer : ${label}`}>
            <Trash2 aria-hidden />
            Retirer
          </Button>
        )}
      </div>
      {message && <FormMessage message={message.text} tone={message.tone} />}
    </div>
  );
}

/** Coordonnées imprimées sur toutes les factures de l'agence. */
export function InvoiceSettingsForm({ settings, agencyName }: { settings: InvoiceSettings; agencyName: string }) {
  const [state, action, pending] = useActionState(saveInvoiceSettingsAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok || !state.values ? settings : { ...settings, ...state.values };
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="legalName" label="Nom affiché sur les factures" error={e.legalName} hint={`Vide : « ${agencyName} ». Exemple : raison sociale.`}>
          <Input id="legalName" name="legalName" defaultValue={v.legalName} maxLength={160} {...describedBy("legalName", e.legalName, "hint")} />
        </FormField>
        <FormField id="signatoryName" label="Nom du signataire" error={e.signatoryName} hint="Sous la signature. Ex. : Marie Ngo, directrice.">
          <Input id="signatoryName" name="signatoryName" defaultValue={v.signatoryName} maxLength={120} {...describedBy("signatoryName", e.signatoryName, "hint")} />
        </FormField>
        <FormField id="address" label="Adresse" error={e.address} className="sm:col-span-2">
          <Input id="address" name="address" defaultValue={v.address} maxLength={250} placeholder="Ex. : Rue de la Joie, Akwa, Douala" {...describedBy("address", e.address)} />
        </FormField>
        <FormField id="phone" label="Téléphone" error={e.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={v.phone} maxLength={40} {...describedBy("phone", e.phone)} />
        </FormField>
        <FormField id="email" label="E-mail" error={e.email}>
          <Input id="email" name="email" type="email" defaultValue={v.email} maxLength={254} {...describedBy("email", e.email)} />
        </FormField>
        <FormField id="taxId" label="Identifiants légaux" error={e.taxId} hint="Ex. : NIU M0123456789 · RCCM RC/DLA/2024/B/1234." className="sm:col-span-2">
          <Input id="taxId" name="taxId" defaultValue={v.taxId} maxLength={160} {...describedBy("taxId", e.taxId, "hint")} />
        </FormField>
        <FormField id="paymentDetails" label="Mode de paiement proposé" error={e.paymentDetails} hint="Prérempli sur chaque nouvelle facture (modifiable)." className="sm:col-span-2">
          <Textarea
            id="paymentDetails"
            name="paymentDetails"
            rows={3}
            defaultValue={v.paymentDetails}
            maxLength={500}
            placeholder={"Ex. : Virement — Banque X, compte n° 10005 00001 12345678901 23\nOrange Money : 6 90 00 00 00 (Agence Y)"}
            {...describedBy("paymentDetails", e.paymentDetails, "hint")}
          />
        </FormField>
        <FormField id="footerNote" label="Mention en bas de facture" error={e.footerNote} hint="Ex. : conditions de paiement, pénalités de retard." className="sm:col-span-2">
          <Textarea id="footerNote" name="footerNote" rows={2} defaultValue={v.footerNote} maxLength={500} {...describedBy("footerNote", e.footerNote, "hint")} />
        </FormField>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
