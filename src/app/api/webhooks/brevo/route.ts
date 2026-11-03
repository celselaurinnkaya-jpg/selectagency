import { NextResponse, type NextRequest } from "next/server";
import { parseBrevoEvents, secretInUrl, webhookSecretFrom } from "@/lib/email/webhook";
import { createSystemClient } from "@/lib/supabase/system";

// Webhook Brevo : suivi réel de la livraison des e-mails transactionnels (livré, rejeté, signalé comme
// indésirable, désinscrit…). Le secret arrive dans un en-tête (jeton « Bearer » ou « x-webhook-secret ») et
// la base le compare à son empreinte (fonction apply_brevo_webhook) : ni clé secrète Supabase, ni secret
// connu du serveur. La réponse ne contient que des nombres.

export async function POST(request: NextRequest) {
  if (secretInUrl(request.nextUrl)) {
    return NextResponse.json({ ok: false, error: "Le secret doit être envoyé dans un en-tête, jamais dans l'adresse." }, { status: 400 });
  }
  const secret = webhookSecretFrom(request.headers);
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Secret webhook absent." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corps JSON invalide." }, { status: 400 });
  }

  const events = parseBrevoEvents(body);
  const db = createSystemClient();
  let updated = 0;

  for (const item of events) {
    const { data, error } = await db.rpc("apply_brevo_webhook", {
      p_secret: secret,
      p_brevo_message_id: item.messageId,
      p_event: item.event,
      p_reason: item.reason,
      p_outbox_id: item.outboxId,
    });
    if (error) {
      // Mauvais secret : refus. Autre erreur : Brevo réessaiera plus tard.
      return error.code === "42501"
        ? NextResponse.json({ ok: false, error: "Secret webhook invalide." }, { status: 401 })
        : NextResponse.json({ ok: false, error: "Mise à jour impossible pour le moment." }, { status: 500 });
    }
    if (data === true) updated += 1;
  }

  return NextResponse.json({ ok: true, received: events.length, updated });
}
