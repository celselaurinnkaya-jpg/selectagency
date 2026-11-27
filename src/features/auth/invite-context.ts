// Personne arrivée par un lien d'invitation (équipe, espace client, espace partenaire) : elle crée seulement son
// compte et rejoint ce à quoi on l'a invitée. La création d'une agence ne lui est pas proposée.

export type InviteKind = "team" | "client" | "partner";

const PATHS: Record<InviteKind, string> = { team: "/invite", client: "/acces-client", partner: "/acces-partenaire" };

/** Lien d'invitation contenu dans l'adresse de retour (« next ») de la page d'inscription ou de connexion. */
export function inviteFromNext(next: string | undefined): { kind: InviteKind; token: string } | undefined {
  const match = /^\/(invite|acces-client|acces-partenaire)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(next ?? "");
  if (!match) return undefined;
  const kind = (Object.keys(PATHS) as InviteKind[]).find((k) => PATHS[k] === `/${match[1]!.toLowerCase()}`)!;
  return { kind, token: match[2]!.toLowerCase() };
}

/** Adresse du lien d'invitation. */
export const inviteHref = (kind: InviteKind, token: string) => `${PATHS[kind]}/${token}`;

/** Texte sous le titre de la page d'inscription. */
export function signupDescription(kind?: InviteKind, agencyName?: string): string {
  const agency = agencyName?.trim();
  if (kind === "team") return `Créez votre compte pour rejoindre l'équipe ${agency ? `de ${agency}` : "de l'agence qui vous a invité"}.`;
  if (kind === "client") return `Créez votre compte pour ouvrir votre espace client ${agency ? `chez ${agency}` : "auprès de votre agence"}.`;
  if (kind === "partner") return `Créez votre compte pour ouvrir votre espace partenaire ${agency ? `chez ${agency}` : "auprès de l'agence"}.`;
  return "Votre compte personnel. Vous créerez ensuite votre agence.";
}
