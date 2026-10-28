import type { Client } from "@/lib/domain/types";

// Détection des doublons possibles (plan §9.2) : on signale, on ne fusionne jamais automatiquement.
// Le téléphone et l'e-mail sont comparés à l'identique après normalisation (et non « contient »,
// qui signalait un doublon dès la saisie de l'indicatif +237).

export const normalizeName = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z]/g, "").toLowerCase();

export interface DuplicateCandidate {
  client: Client;
  reasons: string[];
}

export function findDuplicates(
  clients: Client[],
  input: { firstName: string; lastName: string; phoneE164?: string; email?: string },
): DuplicateCandidate[] {
  const fullName = normalizeName(input.firstName + input.lastName);
  const email = input.email?.trim().toLowerCase();
  return clients
    .map((client) => {
      const reasons: string[] = [];
      if (input.phoneE164 && (client.phoneE164 === input.phoneE164 || client.whatsappE164 === input.phoneE164)) reasons.push("même numéro de téléphone");
      if (email && client.email?.toLowerCase() === email) reasons.push("même adresse e-mail");
      if (fullName && normalizeName(client.firstName + client.lastName) === fullName) reasons.push("même nom");
      return { client, reasons };
    })
    .filter((candidate) => candidate.reasons.length > 0);
}
