"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { PLAN, toPlan } from "@/lib/data/rows";
import { siteUrl } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

// Paiement de l'abonnement de l'agence à SELECT, par carte (Stripe Checkout), et gestion de la carte (portail
// client Stripe). Réservé au propriétaire et aux administrateurs. Fonctionne aussi pour une agence dont l'essai est
// terminé (consultation seulement) : c'est précisément elle qui doit pouvoir payer.
// Le lien entre le paiement et l'agence est fait par le webhook Stripe signé (métadonnées organization_id).

const ROLE_MESSAGE = "Seuls le propriétaire et les administrateurs de l'agence peuvent gérer l'abonnement.";
const NOT_READY = "Le paiement par carte n'est pas encore disponible : écrivez au support SELECT.";
/** États d'un abonnement Stripe en cours : on gère la carte, on ne souscrit pas une deuxième fois. */
const ONGOING = new Set(["active", "past_due"]);

export async function startCardCheckoutAction(planId: string): Promise<FormState> {
  if (!z.uuid().safeParse(planId).success) return { message: "Formule introuvable." };
  if (!isStripeConfigured()) return { message: NOT_READY };
  const stripe = getStripe();
  if (!stripe) return { message: NOT_READY };

  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "billing.read")) return { message: ROLE_MESSAGE };
  if (ctx.isDemo) return { message: "Une agence de démonstration ne peut pas s'abonner : créez votre agence pour continuer." };
  const subscription = ctx.subscription;
  if (subscription?.stripeSubscriptionId && ONGOING.has(subscription.status)) {
    return { message: "Votre agence a déjà un abonnement payé par carte : utilisez « Gérer ma carte et mon abonnement » pour changer de formule." };
  }

  const { data: planRow } = await ctx.supabase.from("plans").select(PLAN.list).eq("id", planId).eq("is_active", true).maybeSingle();
  if (!planRow) return { message: "Formule introuvable ou retirée." };
  const plan = toPlan(planRow as Record<string, unknown>);
  if (!plan.stripePriceId) return { message: `La formule « ${plan.name} » n'est pas encore payable par carte : écrivez au support SELECT.` };

  const base = siteUrl();
  const metadata = { organization_id: ctx.organizationId, plan_id: plan.id };
  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      // Client Stripe déjà connu : on le réutilise ; sinon Stripe le crée au moment du paiement.
      ...(subscription?.stripeCustomerId ? { customer: subscription.stripeCustomerId } : { customer_email: ctx.member.email || undefined }),
      client_reference_id: ctx.organizationId,
      metadata,
      subscription_data: { metadata },
      locale: "fr",
      success_url: `${base}/settings/billing?paiement=ok`,
      cancel_url: `${base}/settings/billing?paiement=annule`,
    });
    url = session.url;
  } catch {
    return { message: "Stripe n'a pas pu ouvrir la page de paiement. Réessayez dans un instant." };
  }
  if (!url) return { message: "Stripe n'a pas pu ouvrir la page de paiement. Réessayez dans un instant." };
  redirect(url);
}

export async function openCardPortalAction(): Promise<FormState> {
  if (!isStripeConfigured()) return { message: NOT_READY };
  const stripe = getStripe();
  if (!stripe) return { message: NOT_READY };

  const ctx = await getAgencyContext();
  if (!can(ctx.member.role, "billing.read")) return { message: ROLE_MESSAGE };
  const customerId = ctx.subscription?.stripeCustomerId;
  if (!customerId) return { message: "Aucun paiement par carte n'est encore enregistré pour votre agence." };

  let url: string | null = null;
  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${siteUrl()}/settings/billing`, locale: "fr" });
    url = portal.url;
  } catch {
    return { message: "Stripe n'a pas pu ouvrir la gestion de votre carte. Réessayez dans un instant." };
  }
  redirect(url);
}
