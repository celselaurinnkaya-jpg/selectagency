"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, KeyRound, MessageCircle, Pencil, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import type { Partner, PartnerCommission } from "@/lib/domain/types";
import { CURRENCY_OPTIONS, minorUnits } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/features/finance/payments";
import {
  cancelCommissionAction,
  createPartnerAccessAction,
  payCommissionAction,
  revokePartnerAccessAction,
  savePartnerAction,
  updateCommissionAction,
} from "./actions";

// Formulaires des partenaires. Champs contrôlés envoyés par onSubmit (rien ne se perd après une erreur).

const amountInput = (minor: number, currency: string) => {
  const digits = minorUnits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits).replace(".", ",");
};

export function PartnerForm({ partner, defaultCurrency }: { partner?: Partner; defaultCurrency: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const pending = saving || leaving;
  const [name, setName] = useState(partner?.name ?? "");
  const [code, setCode] = useState(partner?.code ?? "");
  const [phone, setPhone] = useState(partner?.phone ?? "");
  const [email, setEmail] = useState(partner?.email ?? "");
  const [currency, setCurrency] = useState(partner?.currency ?? defaultCurrency);
  const [commission, setCommission] = useState(partner ? amountInput(partner.commissionMinor, partner.currency) : "");
  const [notes, setNotes] = useState(partner?.notes ?? "");
  const [isActive, setIsActive] = useState(partner?.isActive ?? true);
  const e = state.fieldErrors ?? {};

  return (
    <form
      noValidate
      className="space-y-5 rounded-2xl bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await savePartnerAction({ partnerId: partner?.id ?? "", name, code, phone, email, commission, currency, notes, isActive });
          if (result.ok && result.redirectTo) {
            setLeaving(true);
            window.location.assign(result.redirectTo);
          } else setState(result);
        });
      }}
    >
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-4 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)] sm:grid-cols-2">
        <FormField id="pa-name" label="Nom du partenaire" required error={e.name}>
          <Input id="pa-name" value={name} maxLength={120} onChange={(ev) => setName(ev.target.value)} placeholder="Ex. : Amina Ngo, Lycée Leclerc" {...describedBy("pa-name", e.name)} />
        </FormField>
        <FormField id="pa-code" label="Code partenaire" required error={e.code} hint="Le client le donne à son arrivée. Lettres, chiffres, tirets.">
          <Input
            id="pa-code"
            value={code}
            maxLength={20}
            onChange={(ev) => setCode(ev.target.value.toUpperCase())}
            placeholder="Ex. : AMINA-2026"
            className="font-mono uppercase"
            {...describedBy("pa-code", e.code, "hint")}
          />
        </FormField>
        <FormField id="pa-phone" label="Téléphone" error={e.phone}>
          <Input id="pa-phone" type="tel" inputMode="tel" value={phone} onChange={(ev) => setPhone(ev.target.value)} />
        </FormField>
        <FormField id="pa-email" label="Adresse e-mail" error={e.email}>
          <Input id="pa-email" type="email" inputMode="email" value={email} onChange={(ev) => setEmail(ev.target.value)} {...describedBy("pa-email", e.email)} />
        </FormField>
        <FormField id="pa-commission" label={`Commission par client apporté (${currency})`} error={e.commission} hint="Montant fixé par l'agence, ajustable ensuite client par client. 0 : pas de commission.">
          <Input id="pa-commission" inputMode="decimal" value={commission} onChange={(ev) => setCommission(ev.target.value)} className="tabular-nums" placeholder="Ex. : 25000" {...describedBy("pa-commission", e.commission, "hint")} />
        </FormField>
        <FormField id="pa-currency" label="Devise" required>
          <select id="pa-currency" value={currency} onChange={(ev) => setCurrency(ev.target.value)} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="pa-notes" label="Notes" className="sm:col-span-2">
          <Textarea id="pa-notes" rows={2} maxLength={1000} value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Ex. : versement Orange Money au 690 00 00 00, en fin de mois" />
        </FormField>
        {partner && (
          <label className="flex min-h-10 items-start gap-3 text-sm text-slate-800 sm:col-span-2">
            <input type="checkbox" checked={isActive} onChange={(ev) => setIsActive(ev.target.checked)} className="mt-0.5 size-5 accent-navy-800" />
            <span>
              <span className="font-medium">Partenaire actif</span>
              <span className="block text-xs text-slate-500">Décoché : son code n&apos;est plus accepté et son espace est fermé ; ses clients et commissions restent visibles.</span>
            </span>
          </label>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={partner ? `/partners/${partner.id}` : "/partners"}>Annuler</Link>
        </Button>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Enregistrement…" : partner ? "Enregistrer les modifications" : "Créer le partenaire"}
        </Button>
      </div>
    </form>
  );
}

/** Actions sur une commission : ajuster le montant, marquer payée (date, moyen, référence), annuler. */
export function CommissionActions({ commission, today }: { commission: PartnerCommission; today: string }) {
  const [mode, setMode] = useState<"idle" | "pay" | "amount" | "cancel">("idle");
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState(PAYMENT_METHODS[1]!.label);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(amountInput(commission.amountMinor, commission.currency));
  const [reason, setReason] = useState("");
  const id = commission.id.slice(0, 8);
  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      const result = await action();
      setState(result);
      if (result.ok) setMode("idle");
    });
  if (commission.status === "paid" || commission.status === "cancelled") return null;

  return (
    <div className="space-y-2">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          {commission.status === "approved" && (
            <Button type="button" variant="accent" onClick={() => setMode("pay")}>
              <Wallet aria-hidden />
              Marquer payée
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setMode("amount")}>
            <Pencil aria-hidden />
            Ajuster le montant
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("cancel")} className="text-red-700 hover:bg-red-50 hover:text-red-800">
            <X aria-hidden />
            Annuler
          </Button>
        </div>
      )}
      {mode === "pay" && (
        <form
          noValidate
          className="grid gap-3 rounded-lg bg-surface p-3 sm:grid-cols-3 sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => payCommissionAction({ id: commission.id, date, method, reference }));
          }}
        >
          <FormField id={`co-date-${id}`} label="Date du versement" required>
            <Input id={`co-date-${id}`} type="date" max={today} value={date} onChange={(ev) => setDate(ev.target.value)} />
          </FormField>
          <FormField id={`co-method-${id}`} label="Moyen" required>
            <select id={`co-method-${id}`} value={method} onChange={(ev) => setMethod(ev.target.value)} className={selectClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.label}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id={`co-ref-${id}`} label="Référence">
            <Input id={`co-ref-${id}`} value={reference} maxLength={80} onChange={(ev) => setReference(ev.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="submit" variant="accent" disabled={pending}>
              {pending ? "Enregistrement…" : "Confirmer le versement"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
              Retour
            </Button>
          </div>
        </form>
      )}
      {mode === "amount" && (
        <form
          noValidate
          className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updateCommissionAction(commission.id, amount, commission.currency));
          }}
        >
          <FormField id={`co-amount-${id}`} label={`Montant (${commission.currency})`}>
            <Input id={`co-amount-${id}`} inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value)} className="tabular-nums" />
          </FormField>
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
            Retour
          </Button>
        </form>
      )}
      {mode === "cancel" && (
        <form
          noValidate
          className="flex flex-wrap items-end gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => cancelCommissionAction(commission.id, reason));
          }}
        >
          <FormField id={`co-reason-${id}`} label="Motif de l'annulation" required className="min-w-56 flex-1">
            <Input id={`co-reason-${id}`} value={reason} maxLength={300} onChange={(ev) => setReason(ev.target.value)} placeholder="Ex. : client parti avant tout service" />
          </FormField>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Annulation…" : "Confirmer l'annulation"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
            Retour
          </Button>
        </form>
      )}
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}

/** Espace partenaire : créer le lien (lié à une adresse e-mail), le transmettre, ou retirer l'accès. */
export function PartnerAccess({
  partnerId,
  partnerName,
  defaultEmail,
  hasAccess,
  pendingLink,
  pendingEmail,
}: {
  partnerId: string;
  partnerName: string;
  defaultEmail?: string;
  hasAccess: boolean;
  pendingLink?: string;
  pendingEmail?: string;
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(pendingEmail ?? defaultEmail ?? "");
  const [copied, setCopied] = useState(false);
  const link = state.ok && state.redirectTo ? state.redirectTo : pendingLink;
  const text = link ? `Bonjour ${partnerName}, voici votre accès à l'espace partenaire : vos clients et vos commissions. Ouvrez ce lien et connectez-vous avec l'adresse ${email} : ${link}` : "";

  return (
    <div className="space-y-3">
      {hasAccess && <p className="text-sm text-emerald-800">Le partenaire a ouvert son espace : il y voit ses clients (prénom et initiale) et ses commissions.</p>}
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => setState(await createPartnerAccessAction(partnerId, email)));
        }}
      >
        <FormField id={`acc-email-${partnerId.slice(0, 8)}`} label="Adresse e-mail du partenaire" required className="min-w-60 flex-1">
          <Input id={`acc-email-${partnerId.slice(0, 8)}`} type="email" inputMode="email" value={email} onChange={(ev) => setEmail(ev.target.value)} />
        </FormField>
        <Button type="submit" variant={hasAccess ? "outline" : "accent"} disabled={pending}>
          <KeyRound aria-hidden />
          {pending ? "Création…" : hasAccess ? "Nouveau lien d'accès" : "Créer le lien d'accès"}
        </Button>
      </form>
      {link && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          <p>Lien à transmettre au partenaire. Il se connecte (ou crée son compte) avec {email} :</p>
          <p className="break-all font-mono text-xs text-slate-800">{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              <Copy aria-hidden />
              {copied ? "Lien copié" : "Copier le lien"}
            </Button>
            <Button asChild variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                Préparer un message WhatsApp
              </a>
            </Button>
          </div>
        </div>
      )}
      {(hasAccess || pendingLink) && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(async () => setState(await revokePartnerAccessAction(partnerId)))}
          className="text-red-700 hover:bg-red-50 hover:text-red-800"
        >
          Retirer l&apos;accès
        </Button>
      )}
      {!(state.ok && state.redirectTo) && <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />}
    </div>
  );
}
