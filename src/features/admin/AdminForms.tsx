"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Plug, ShieldCheck, Trash2, CheckCircle2, Copy, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { BILLING_PERIOD, METHOD_KIND, SUBSCRIPTION_STATUS } from "@/lib/domain/labels";
import type { BillingPeriod, PaymentMethodKind, SubscriptionStatus } from "@/lib/domain/types";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";
import {
  configureAgencyWhatsAppAction,
  disconnectAgencyWhatsAppAction,
  recordSubscriptionPaymentAction,
  replyTicketAction,
  savePlanAction,
  updateSubscriptionAction,
  voidSubscriptionPaymentAction,
} from "./actions";
import type { AgencyWhatsAppDetail } from "./queries";

// Formulaires de la console SELECT. Toutes les actions passent par les fonctions platform_* de la
// base, qui inscrivent chaque modification au journal.

interface PlanValues {
  id?: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  billingPeriod: BillingPeriod;
  maxMembers: string;
  isActive: boolean;
  /** Tarif Stripe (price_…) : vide = formule payable seulement auprès de SELECT. */
  stripePriceId?: string;
}

export function PlanForm({ plan }: { plan?: PlanValues }) {
  const [state, action, pending] = useActionState(savePlanAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  const key = plan?.id?.slice(0, 8) ?? "nouvelle";
  return (
    <form action={action} className="space-y-3" noValidate>
      {plan?.id && <input type="hidden" name="planId" value={plan.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id={`plan-name-${key}`} label="Nom" required error={e.name} className="sm:col-span-2 lg:col-span-1">
          <Input id={`plan-name-${key}`} name="name" defaultValue={v.name ?? plan?.name} placeholder="Ex. : Essentiel" {...describedBy(`plan-name-${key}`, e.name)} />
        </FormField>
        <FormField id={`plan-price-${key}`} label="Prix" required error={e.price} hint="0 pour une formule gratuite">
          <Input id={`plan-price-${key}`} name="price" inputMode="decimal" defaultValue={v.price ?? plan?.price} className="tabular-nums" {...describedBy(`plan-price-${key}`, e.price, "hint")} />
        </FormField>
        <FormField id={`plan-currency-${key}`} label="Devise" required error={e.currency}>
          <select id={`plan-currency-${key}`} name="currency" defaultValue={v.currency ?? plan?.currency ?? "XAF"} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id={`plan-period-${key}`} label="Périodicité" required error={e.billingPeriod}>
          <select id={`plan-period-${key}`} name="billingPeriod" defaultValue={v.billingPeriod ?? plan?.billingPeriod ?? "monthly"} className={selectClass}>
            {(Object.keys(BILLING_PERIOD) as BillingPeriod[]).map((p) => (
              <option key={p} value={p}>
                {BILLING_PERIOD[p].label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id={`plan-members-${key}`} label="Membres maximum" error={e.maxMembers} hint="Vide = sans limite">
          <Input id={`plan-members-${key}`} name="maxMembers" type="number" min={1} max={1000} defaultValue={v.maxMembers ?? plan?.maxMembers} {...describedBy(`plan-members-${key}`, e.maxMembers, "hint")} />
        </FormField>
        <FormField id={`plan-description-${key}`} label="Description" error={e.description} className="sm:col-span-2 lg:col-span-3">
          <Input id={`plan-description-${key}`} name="description" defaultValue={v.description ?? plan?.description} placeholder="Ce que comprend la formule, en une phrase" />
        </FormField>
        <FormField
          id={`plan-stripe-${key}`}
          label="Tarif Stripe (paiement par carte)"
          error={e.stripePriceId}
          hint="Identifiant « price_… » du tarif récurrent créé dans Stripe. Vide : payable seulement auprès de SELECT."
          className="sm:col-span-2 lg:col-span-4"
        >
          <Input
            id={`plan-stripe-${key}`}
            name="stripePriceId"
            defaultValue={v.stripePriceId ?? plan?.stripePriceId}
            placeholder="price_…"
            autoComplete="off"
            spellCheck={false}
            {...describedBy(`plan-stripe-${key}`, e.stripePriceId, "hint")}
          />
        </FormField>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="isActive" defaultChecked={v.isActive ? v.isActive === "on" : (plan?.isActive ?? true)} className="size-4 accent-navy-800" />
        Proposée aux agences (visible dans leur page Abonnement)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant={plan ? "outline" : "accent"} disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : plan ? "Enregistrer la formule" : "Créer la formule"}
        </Button>
      </div>
    </form>
  );
}

const STATUS_CHOICES: SubscriptionStatus[] = ["trialing", "active", "past_due", "suspended", "cancelled"];

export function SubscriptionForm({
  organizationId,
  plans,
  current,
}: {
  organizationId: string;
  plans: { value: string; label: string }[];
  current: { planId?: string; status: SubscriptionStatus; trialEndsAt?: string; currentPeriodEnd?: string };
}) {
  const [state, action, pending] = useActionState(updateSubscriptionAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="sub-status" label="Statut" required error={e.status}>
          <select id="sub-status" name="status" defaultValue={v.status ?? current.status} className={selectClass}>
            {STATUS_CHOICES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS[s].label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="sub-plan" label="Formule" error={e.planId}>
          <select id="sub-plan" name="planId" defaultValue={v.planId ?? current.planId ?? ""} className={selectClass}>
            <option value="">Aucune (essai)</option>
            {plans.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="sub-trial" label="Fin de l'essai" error={e.trialEndsAt}>
          <Input id="sub-trial" name="trialEndsAt" type="date" defaultValue={v.trialEndsAt ?? current.trialEndsAt} {...describedBy("sub-trial", e.trialEndsAt)} />
        </FormField>
        <FormField id="sub-period" label="Échéance de l'abonnement" error={e.currentPeriodEnd} hint="Vide = sans échéance">
          <Input id="sub-period" name="currentPeriodEnd" type="date" defaultValue={v.currentPeriodEnd ?? current.currentPeriodEnd} {...describedBy("sub-period", e.currentPeriodEnd, "hint")} />
        </FormField>
      </div>
      <FormField id="sub-reason" label="Motif" required error={e.reason} hint="Conservé dans le journal de la console.">
        <Input id="sub-reason" name="reason" defaultValue={v.reason} placeholder="Ex. : prolongation d'essai accordée, impayé depuis 15 jours" {...describedBy("sub-reason", e.reason, "hint")} />
      </FormField>
      <p className="text-xs text-slate-500">
        « Suspendu », « Résilié » ou un essai dont la date est passée mettent l&apos;agence en lecture seule : ses données restent consultables, son
        accès au support aussi.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant="outline" disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : "Modifier l'abonnement"}
        </Button>
      </div>
    </form>
  );
}

export function SubscriptionPaymentForm({
  organizationId,
  plans,
  defaultCurrency,
  defaultPlanId,
  today,
}: {
  organizationId: string;
  plans: { value: string; label: string }[];
  defaultCurrency: string;
  defaultPlanId?: string;
  today: string;
}) {
  const [state, action, pending] = useActionState(recordSubscriptionPaymentAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="subpay-amount" label="Montant reçu" required error={e.amount}>
          <Input id="subpay-amount" name="amount" inputMode="decimal" defaultValue={v.amount} className="tabular-nums" {...describedBy("subpay-amount", e.amount)} />
        </FormField>
        <FormField id="subpay-currency" label="Devise" required error={e.currency}>
          <select id="subpay-currency" name="currency" defaultValue={v.currency ?? defaultCurrency} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="subpay-method" label="Moyen de paiement" required error={e.methodKind}>
          <select id="subpay-method" name="methodKind" defaultValue={v.methodKind ?? "mobile_money"} className={selectClass}>
            {(Object.keys(METHOD_KIND) as PaymentMethodKind[]).filter((m) => m !== "card").map((m) => (
              <option key={m} value={m}>
                {METHOD_KIND[m]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="subpay-reference" label="Référence de la transaction" error={e.reference}>
          <Input id="subpay-reference" name="reference" defaultValue={v.reference} />
        </FormField>
        <FormField id="subpay-date" label="Date du paiement" required error={e.paidDate}>
          <Input id="subpay-date" name="paidDate" type="date" defaultValue={v.paidDate ?? today} max={today} />
        </FormField>
        <FormField id="subpay-plan" label="Formule payée" error={e.planId}>
          <select id="subpay-plan" name="planId" defaultValue={v.planId ?? defaultPlanId ?? ""} className={selectClass}>
            <option value="">Non précisée</option>
            {plans.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="subpay-period" label="Nouvelle échéance" error={e.periodEnd} hint="Si renseignée, l'abonnement devient actif jusqu'à cette date." className="sm:col-span-2 lg:col-span-1">
          <Input id="subpay-period" name="periodEnd" type="date" defaultValue={v.periodEnd} {...describedBy("subpay-period", e.periodEnd, "hint")} />
        </FormField>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant="accent" disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : "Enregistrer le paiement"}
        </Button>
      </div>
    </form>
  );
}

export function VoidSubscriptionPaymentForm({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(voidSubscriptionPaymentAction, initialFormState);
  const id = paymentId.slice(0, 8);
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-9 cursor-pointer items-center font-medium text-red-700">Annuler ce paiement</summary>
      <form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="paymentId" value={paymentId} />
        <FormField id={`void-${id}`} label="Motif" required className="min-w-0 flex-1">
          <Input id={`void-${id}`} name="reason" placeholder="Ex. : montant saisi deux fois" />
        </FormField>
        <Button type="submit" size="sm" variant="destructive" disabled={pending} className="h-10">
          {pending ? "Annulation…" : "Confirmer l'annulation"}
        </Button>
      </form>
      <div className="mt-1">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </div>
    </details>
  );
}

export function AdminReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(replyTicketAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField id="admin-reply" label="Réponse de l'équipe SELECT" required error={e.body}>
        <Textarea id="admin-reply" name="body" rows={5} defaultValue={v.body} {...describedBy("admin-reply", e.body)} />
      </FormField>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" name="status" value="resolved" variant="outline" disabled={pending}>
          Répondre et clore
        </Button>
        <Button type="submit" name="status" value="answered" variant="accent" disabled={pending}>
          {pending ? "Envoi…" : "Répondre"}
        </Button>
      </div>
    </form>
  );
}

export function AdminAgencyWhatsAppForm({
  organizationId,
  current,
}: {
  organizationId: string;
  current?: AgencyWhatsAppDetail | null;
}) {
  const [state, action, pending] = useActionState(configureAgencyWhatsAppAction, initialFormState);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const router = useRouter();

  const isConnected = current?.id && current?.status === "connected";
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});

  const handleCopy = (text: string, isToken: boolean) => {
    navigator.clipboard.writeText(text);
    if (isToken) {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    if (!current?.id) return;
    if (!confirm("Voulez-vous vraiment déconnecter la ligne WhatsApp de cette agence ?")) return;
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      const fd = new FormData();
      fd.append("organizationId", organizationId);
      fd.append("accountId", current.id);
      const res = await disconnectAgencyWhatsAppAction(fd);
      if (!res.ok) {
        setDisconnectError(res.message);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      setDisconnectError(err instanceof Error ? err.message : "Erreur lors de la déconnexion.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.select-agency.com";
  const webhookUrl = `${origin}/api/webhooks/whatsapp`;
  const verifyToken = "select_agency_wa_token_2026";

  return (
    <div className="space-y-6">
      {/* Statut actuel de la ligne */}
      {isConnected ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                <Smartphone className="size-4" />
              </span>
              <div>
                <h4 className="font-semibold text-emerald-950 flex items-center gap-2 text-sm">
                  {current.displayPhoneNumber}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                    <CheckCircle2 className="size-3" /> Connectée (Cloud API)
                  </span>
                </h4>
                <p className="text-xs text-emerald-800/80">
                  {current.verifiedName || "Nom non renseigné"} · Coexistence mobile :{" "}
                  {current.coexistence ? "Activée" : "Désactivée"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="size-3.5 mr-1" />
              {isDisconnecting ? "Déconnexion..." : "Déconnecter cette ligne"}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 text-xs text-slate-700 font-mono">
            <div>
              <span className="font-sans text-slate-500 font-normal">Phone Number ID : </span>
              {current.phoneNumberId}
            </div>
            <div>
              <span className="font-sans text-slate-500 font-normal">WABA ID : </span>
              {current.wabaId}
            </div>
          </div>

          {disconnectError && (
            <p className="text-xs text-red-600 font-medium">{disconnectError}</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-slate-700 text-sm">
            <Plug className="size-4 text-slate-500" />
            <span>Aucune ligne WhatsApp Cloud API active pour cette agence.</span>
          </div>
        </div>
      )}

      {/* Formulaire de configuration */}
      <form action={action} className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.06)]" noValidate>
        <input type="hidden" name="organizationId" value={organizationId} />

        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <ShieldCheck className="size-4 text-navy-800" />
          <h4 className="text-sm font-semibold text-navy-900">
            {isConnected ? "Modifier les identifiants Cloud API Meta" : "Associer une ligne WhatsApp Business"}
          </h4>
        </div>

        <p className="text-xs text-slate-600">
          Enregistrez les identifiants officiels WhatsApp Business Cloud API générés sur Meta for Developers. L&apos;agence n&apos;aura aucune manipulation technique à effectuer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            id="wa-display-phone"
            label="Numéro de téléphone affiché"
            required
            error={e.displayPhoneNumber}
          >
            <Input
              id="wa-display-phone"
              name="displayPhoneNumber"
              defaultValue={v.displayPhoneNumber ?? current?.displayPhoneNumber ?? ""}
              placeholder="Ex. : +242 06 400 9999"
              {...describedBy("wa-display-phone", e.displayPhoneNumber)}
            />
          </FormField>

          <FormField
            id="wa-verified-name"
            label="Nom affiché vérifié (optionnel)"
            error={e.verifiedName}
          >
            <Input
              id="wa-verified-name"
              name="verifiedName"
              defaultValue={v.verifiedName ?? current?.verifiedName ?? ""}
              placeholder="Ex. : SELECT Agency Brazzaville"
              {...describedBy("wa-verified-name", e.verifiedName)}
            />
          </FormField>

          <FormField
            id="wa-phone-id"
            label="Phone Number ID (Meta)"
            required
            error={e.phoneNumberId}
          >
            <Input
              id="wa-phone-id"
              name="phoneNumberId"
              defaultValue={v.phoneNumberId ?? current?.phoneNumberId ?? ""}
              placeholder="Ex. : 102938475610293"
              className="font-mono text-xs"
              {...describedBy("wa-phone-id", e.phoneNumberId)}
            />
          </FormField>

          <FormField
            id="wa-waba-id"
            label="WABA ID (WhatsApp Business Account ID)"
            required
            error={e.wabaId}
          >
            <Input
              id="wa-waba-id"
              name="wabaId"
              defaultValue={v.wabaId ?? current?.wabaId ?? ""}
              placeholder="Ex. : 987654321098765"
              className="font-mono text-xs"
              {...describedBy("wa-waba-id", e.wabaId)}
            />
          </FormField>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700">
            <input
              type="checkbox"
              name="coexistence"
              value="true"
              defaultChecked={current ? current.coexistence : true}
              className="mt-0.5 rounded border-slate-300 text-navy-800 focus:ring-navy-600"
            />
            <span>
              <strong className="text-slate-900 block font-medium">Mode Coexistence Mobile</strong>
              Permet à l&apos;équipe de l&apos;agence de continuer à utiliser l&apos;application mobile WhatsApp Business sur leur téléphone sans coupure, tout en bénéficiant de l&apos;Agent IA.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
          <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
          <Button type="submit" variant="accent" disabled={pending} className="min-w-36">
            {pending ? "Enregistrement..." : isConnected ? "Mettre à jour la ligne" : "Connecter la ligne"}
          </Button>
        </div>
      </form>

      {/* Rappel des paramètres Webhook pour Meta Developers */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-navy-800" />
          <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider">
            Paramètres Webhook Meta Developers (Global Plateforme)
          </h4>
        </div>
        <p className="text-xs text-slate-600">
          À configurer une seule fois dans l&apos;application Meta Developers dans la section <strong>WhatsApp &gt; Configuration &gt; Webhooks</strong> :
        </p>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div>
            <span className="block font-medium text-slate-600 mb-1">URL de rappel (Callback URL) :</span>
            <div className="flex items-center gap-1.5">
              <Input readOnly value={webhookUrl} className="h-8 text-xs font-mono bg-white" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(webhookUrl, false)}
                className="h-8 w-8 p-0 shrink-0 cursor-pointer"
                title="Copier l'URL"
              >
                {copiedWebhook ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </div>

          <div>
            <span className="block font-medium text-slate-600 mb-1">Jeton de vérification (Verify Token) :</span>
            <div className="flex items-center gap-1.5">
              <Input readOnly value={verifyToken} className="h-8 text-xs font-mono bg-white" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(verifyToken, true)}
                className="h-8 w-8 p-0 shrink-0 cursor-pointer"
                title="Copier le token"
              >
                {copiedToken ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 pt-1">
          Champs d&apos;abonnement webhook requis dans Meta : <code className="rounded bg-slate-200/70 px-1 py-0.5 text-slate-800 font-mono">messages</code>, <code className="rounded bg-slate-200/70 px-1 py-0.5 text-slate-800 font-mono">messaging_postbacks</code>.
        </div>
      </div>
    </div>
  );
}
