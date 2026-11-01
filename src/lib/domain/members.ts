import type { Member } from "./types";

/** Membres en poste : les seuls qu'on peut choisir comme responsable d'un client, d'un dossier ou d'une tâche. */
export function activeMembers(members: Member[]): Member[] {
  return members.filter((m) => !m.removedAt);
}
