import type { MessageAudience, MessageTemplate } from "@/lib/domain/types";
import { formatRelativeDay } from "@/lib/format";

// Modèles de messages de l'agence (Paramètres > Modèles de messages), envoyés à la main par l'agent
// (WhatsApp, Messenger…). Les zones entre accolades sont remplies avec les données de la fiche.

export interface TemplateValues {
  prenom: string;
  nom: string;
  agence: string;
  conseiller?: string;
  dossier?: string;
  solde?: string;
  /** Une pièce par ligne, précédée d'un tiret. */
  pieces_manquantes?: string;
  rendez_vous?: string;
}

export type PlaceholderKey = keyof TemplateValues;

/** Zones disponibles, avec la raison affichée quand la fiche n'a pas la donnée. */
export const PLACEHOLDERS: { key: PlaceholderKey; label: string; missing: string }[] = [
  { key: "prenom", label: "Prénom", missing: "prénom inconnu" },
  { key: "nom", label: "Nom", missing: "nom inconnu" },
  { key: "agence", label: "Nom de l'agence", missing: "agence inconnue" },
  { key: "conseiller", label: "Conseiller", missing: "aucun conseiller" },
  { key: "dossier", label: "Référence du dossier", missing: "aucun dossier en cours" },
  { key: "solde", label: "Solde à régler", missing: "aucun solde à régler" },
  { key: "pieces_manquantes", label: "Pièces manquantes", missing: "aucune pièce manquante" },
  { key: "rendez_vous", label: "Prochain rendez-vous", missing: "aucun rendez-vous à venir" },
];

const ZONE = /\{([a-z_]+)\}/g;

/** Message prêt à ouvrir dans WhatsApp, ou indisponible (avec la raison). */
export interface PreparedMessage {
  key: string;
  label: string;
  text: string;
  /** Donnée absente de la fiche : le modèle est proposé grisé, avec cette raison. */
  unavailable?: string;
}

/** Remplit les zones connues ; une zone inconnue reste telle quelle (faute de frappe visible par l'agent). */
export function renderTemplate(body: string, values: TemplateValues): { text: string; missing: PlaceholderKey[] } {
  const missing = new Set<PlaceholderKey>();
  const text = body.replace(ZONE, (whole, name: string) => {
    const spec = PLACEHOLDERS.find((p) => p.key === name);
    if (!spec) return whole;
    const value = values[spec.key]?.trim();
    if (!value) {
      missing.add(spec.key);
      return whole;
    }
    return value;
  });
  return { text, missing: [...missing] };
}

/** Modèles proposés pour une fiche : actifs, destinés à ce public, dans l'ordre choisi par l'agence. */
export function prepareMessages(templates: MessageTemplate[], values: TemplateValues, audience: Exclude<MessageAudience, "any">): PreparedMessage[] {
  const prepared: PreparedMessage[] = templates
    .filter((t) => t.isActive && (t.audience === "any" || t.audience === audience))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
    .map((t) => {
      const { text, missing } = renderTemplate(t.body, values);
      const reasons = missing.map((key) => PLACEHOLDERS.find((p) => p.key === key)!.missing);
      return { key: t.id, label: t.title, text, unavailable: reasons.length ? reasons.join(", ") : undefined };
    });
  // Toujours au moins un message libre, même si l'agence a supprimé tous ses modèles.
  if (!prepared.some((m) => !m.unavailable)) {
    prepared.push({ key: "libre", label: "Message libre", text: `Bonjour ${values.prenom},\n\n\n\n${values.agence}` });
  }
  return prepared;
}

/** Prochain rendez-vous au format du message : « Titre » demain à 10:00, lieu. */
export function appointmentPhrase(a: { title: string; startsAt: string; allDay?: boolean; location?: string }, now: Date, timeZone: string): string {
  const when = formatRelativeDay(a.startsAt, now, timeZone, !a.allDay).toLowerCase();
  return `« ${a.title} » ${when}${a.location ? `, ${a.location}` : ""}`;
}

/** Liste des pièces au format du message (une par ligne). */
export const bulletList = (items: string[]) => (items.length ? items.map((item) => `- ${item}`).join("\n") : undefined);
