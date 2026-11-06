import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { cronSecret } from "@/lib/email/system-worker";
import { idOf, invoiceFacts, organizationFromMetadata, subscriptionPeriodEnd, subscriptionPriceId } from "@/lib/stripe/events";
import { getStripe } from "@/lib/stripe/server";
import { createSystemClient } from "@/lib/supabase/system";

// Webhook Stripe : abonnements des agences à SELECT.
// - Le message est authentifié par sa signature Stripe (STRIPE_WEBHOOK_SECRET).
// - La base est appelée avec le secret serveur de SELECT (CRON_SECRET), vérifié par son empreinte.
// - Toute erreur renvoie un code 500 : Stripe renverra le message plus tard (jamais de paiement perdu en silence).
//   Un message déjà traité est reconnu par la base (une facture n'est enregistrée qu'une fois).
// - La réponse ne contient ni adresse, ni montant, ni secret.

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const serverSecret = cronSecret();
  if (!stripe || !signingSecret || !serverSecret) {
    return NextResponse.json({ ok: false, error: "Paiement par carte non configuré." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Signature Stripe absente." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, signingSecret);
  } catch {
    return NextResponse.json({ ok: false, error: "Signature Stripe invalide." }, { status: 400 });
  }

  const db = createSystemClient();
  let error: { message: string } | null = null;
  let result: unknown = "ignored";

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription") {
        ({ data: result, error } = await db.rpc("stripe_link_checkout", {
          p_secret: serverSecret,
          p_organization_id: organizationFromMetadata(session.metadata) ?? organizationFromMetadata({ organization_id: session.client_reference_id ?? "" }),
          p_customer_id: idOf(session.customer as string | { id: string } | null),
          p_subscription_id: idOf(session.subscription as string | { id: string } | null),
        }));
      }
      break;
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const facts = invoiceFacts(event.data.object);
      if (facts) {
        ({ data: result, error } = await db.rpc("stripe_record_invoice", {
          p_secret: serverSecret,
          p_invoice_id: facts.invoiceId,
          p_customer_id: facts.customerId,
          p_subscription_id: facts.subscriptionId,
          p_price_id: facts.priceId,
          p_amount_minor: facts.amountPaid,
          p_currency: facts.currency,
          p_period_end: facts.periodEnd,
          p_number: facts.number,
          p_organization_id: facts.organizationId,
        }));
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      ({ data: result, error } = await db.rpc("stripe_sync_subscription", {
        p_secret: serverSecret,
        p_subscription_id: subscription.id,
        p_customer_id: idOf(subscription.customer as string | { id: string }),
        p_status: subscription.status,
        p_period_end: subscriptionPeriodEnd(subscription),
        p_organization_id: organizationFromMetadata(subscription.metadata),
        p_price_id: subscriptionPriceId(subscription),
      }));
      break;
    }

    default:
      break;
  }

  if (error) {
    return NextResponse.json({ ok: false, error: "Enregistrement impossible pour le moment." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, type: event.type, result: typeof result === "string" || typeof result === "boolean" ? result : "ok" });
}
