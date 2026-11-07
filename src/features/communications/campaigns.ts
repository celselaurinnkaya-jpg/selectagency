import type { Client } from "@/lib/domain/types";

// Contacts par campagne ou publication, d'après ce que l'agence saisit sur les fiches (aucune donnée des réseaux).

export interface CampaignStat {
  campaign: string;
  contacts: number;
  /** Contacts devenus clients (fiche au statut client). */
  clients: number;
}

/** Regroupe les fiches par campagne (sans tenir compte des majuscules ni des espaces autour). */
export function campaignStats(contacts: Pick<Client, "campaign" | "status">[]): CampaignStat[] {
  const groups = new Map<string, CampaignStat>();
  for (const c of contacts) {
    const name = c.campaign?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("fr");
    const stat = groups.get(key) ?? { campaign: name, contacts: 0, clients: 0 };
    stat.contacts += 1;
    if (c.status !== "prospect") stat.clients += 1;
    groups.set(key, stat);
  }
  return [...groups.values()].sort((a, b) => b.contacts - a.contacts || a.campaign.localeCompare(b.campaign, "fr"));
}
