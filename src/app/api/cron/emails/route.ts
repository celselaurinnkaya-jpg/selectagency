import { NextResponse } from "next/server";
import { cronSecret, isCronAuthorized, runEmailSchedule } from "@/lib/email/system-worker";

// Tâche planifiée quotidienne (Vercel Cron, voir vercel.json) : rappels de rendez-vous de la veille, relances
// automatiques des pièces, alertes d'abonnement, et nouvel essai des e-mails restés en attente.
// Vercel envoie « Authorization: Bearer <CRON_SECRET> » ; toute autre requête est refusée.
// La réponse ne contient que des nombres : ni adresse, ni contenu, ni secret.

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Tâche planifiée non configurée." }, { status: 503 });
  }
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ ok: false, error: "Accès refusé." }, { status: 401 });
  }
  try {
    const result = await runEmailSchedule(secret);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Erreur de la tâche planifiée." }, { status: 500 });
  }
}
