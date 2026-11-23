import { platformAdminForAction } from "@/lib/auth/platform";
import { countryName } from "@/lib/countries";
import { METHOD_KIND, ROLE, SUBSCRIPTION_STATUS } from "@/lib/domain/labels";
import { dayKey, minorUnits } from "@/lib/format";
import { agencyEffectiveStatus, AUDIT_ACTIONS, auditSummary, CONSOLE_TIMEZONE, displayCity } from "@/features/admin/display";
import { listAgencies, listAudit, listPayments, listUsers } from "@/features/admin/queries";

// Export CSV de la console SELECT (rapport de test du 23/11) : agences, utilisateurs, paiements d'abonnement, journal.
// Réservé à l'équipe SELECT connectée avec la double authentification ; les fonctions platform_* revérifient.
// Séparateur « ; » et en-tête UTF-8 (BOM) : le fichier s'ouvre tel quel dans Excel en français.

const KINDS = ["agences", "utilisateurs", "paiements", "journal"] as const;
type Kind = (typeof KINDS)[number];

/** Cellule CSV : guillemets si besoin ; une formule (=, +, -, @) est neutralisée pour le tableur. */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csv = (header: string[], lines: unknown[][]) => "﻿" + [header, ...lines].map((line) => line.map(cell).join(";")).join("\r\n") + "\r\n";
const day = (iso?: string) => (iso ? dayKey(iso, CONSOLE_TIMEZONE) : "");
/** Montant en unités (« 15000 » pour 15 000 FCFA, « 49,90 » pour 49,90 €), lisible comme un nombre par le tableur. */
const amount = (minor: number | undefined, currency: string | undefined) =>
  minor === undefined || !currency ? "" : (minor / 10 ** minorUnits(currency)).toFixed(minorUnits(currency)).replace(".", ",");

async function build(kind: Kind): Promise<string> {
  const now = new Date();
  if (kind === "agences") {
    const agencies = await listAgencies();
    return csv(
      ["Agence", "Ville", "Pays", "Devise", "Type", "Statut", "Formule", "Prix de la formule", "Devise de la formule", "Fin de l'essai", "Échéance",
        "Propriétaire", "E-mail du propriétaire", "Téléphone", "Membres", "Clients", "Dossiers", "Dossiers actifs", "Stockage (octets)",
        "Dernière activité", "Demandes ouvertes", "Inscrite le"],
      agencies.map((a) => {
        const status = agencyEffectiveStatus(a, now);
        return [
          a.name, displayCity(a.city), countryName(a.countryCode), a.currency, a.isDemo ? "Démonstration" : a.isInternal ? "Interne" : "Cliente",
          status ? SUBSCRIPTION_STATUS[status].label : "", a.planName ?? "", amount(a.planPriceMinor, a.planCurrency), a.planCurrency ?? "",
          day(a.trialEndsAt), day(a.currentPeriodEnd), a.ownerName ?? "", a.ownerEmail ?? "", a.phone ?? "", a.members, a.clients, a.cases,
          a.casesActive, a.storageBytes, day(a.lastActivityAt), a.openTickets, day(a.createdAt),
        ];
      }),
    );
  }
  if (kind === "utilisateurs") {
    const users = await listUsers();
    return csv(
      ["E-mail", "Agence", "Rôle", "Équipe SELECT", "E-mail confirmé le", "Inscrit le", "Dernière connexion"],
      users.map((u) => [
        u.email, u.organizationName ?? "Sans agence", u.role ? ROLE[u.role].label : "", u.isPlatformAdmin ? "oui" : "non",
        day(u.emailConfirmedAt), day(u.createdAt), day(u.lastSignInAt),
      ]),
    );
  }
  if (kind === "paiements") {
    const payments = await listPayments();
    return csv(
      ["Agence", "Formule", "Montant", "Devise", "Moyen de paiement", "Référence", "Payé le", "Échéance accordée", "Statut", "Motif d'annulation", "Saisi par"],
      payments.map((p) => [
        p.organizationName, p.planName ?? "", amount(p.amountMinor, p.currency), p.currency, METHOD_KIND[p.methodKind], p.transactionReference ?? "",
        day(p.paidAt), day(p.periodEnd), p.status === "voided" ? "Annulé" : "Reçu", p.voidReason ?? "", p.recordedByEmail ?? "",
      ]),
    );
  }
  const audit = await listAudit();
  return csv(
    ["Date", "Action", "Auteur", "Agence", "Détails"],
    audit.map((e) => [
      `${day(e.at)} ${new Intl.DateTimeFormat("fr-FR", { timeZone: CONSOLE_TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(e.at))}`,
      AUDIT_ACTIONS[e.action] ?? e.action, e.actorEmail || "système", e.organizationName ?? "", auditSummary(e.details),
    ]),
  );
}

export async function GET(_request: Request, { params }: RouteContext<"/admin/export/[kind]">) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new Response("Export inconnu.", { status: 404 });
  if (!(await platformAdminForAction())) return new Response("Réservé à l'équipe SELECT, connectée avec la double authentification.", { status: 403 });
  const body = await build(kind as Kind);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="select-${kind}-${dayKey(new Date(), CONSOLE_TIMEZONE)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
