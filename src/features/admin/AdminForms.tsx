"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { BILLING_PERIOD, METHOD_KIND, SUBSCRIPTION_STATUS } from "@/lib/domain/labels";
import type { BillingPeriod, PaymentMethodKind, SubscriptionStatus } from "@/lib/domain/types";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";
import { recordSubscriptionPaymentAction, replyTicketAction, savePlanAction, updateSubscriptionAction, voidSubscriptionPaymentAction } from "./actions";

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
