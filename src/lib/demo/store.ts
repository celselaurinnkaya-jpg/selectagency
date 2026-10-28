import "server-only";
import { connection } from "next/server";
import { createSeed, type DemoDatabase } from "./fixtures";

// Base de démonstration en mémoire, côté serveur uniquement.
// - Les modifications durent jusqu'au redémarrage du serveur : rien n'est enregistré durablement.
// - Elle est partagée par tous les visiteurs du serveur local : à ne JAMAIS déployer en production.
// Elle sera remplacée par Supabase en Phase 5 ; seules les fonctions `queries.ts` / `actions.ts` changeront.

const holder = globalThis as unknown as { __selectAgencyDemoDb?: DemoDatabase };

export function db(): DemoDatabase {
  holder.__selectAgencyDemoDb ??= createSeed();
  return holder.__selectAgencyDemoDb;
}

export function resetDb(): void {
  holder.__selectAgencyDemoDb = createSeed();
}

/** Lecture à la requête : les données changent, elles ne doivent pas être figées au prérendu. */
export async function readDb(): Promise<{ data: DemoDatabase; now: Date }> {
  await connection();
  return { data: db(), now: new Date() };
}

export function nextNumber(kind: string): number {
  const data = db();
  data.counters[kind] = (data.counters[kind] ?? 0) + 1;
  return data.counters[kind];
}

export function reference(prefix: string, kind: string, year: number): string {
  return `${prefix}-${year}-${String(nextNumber(kind)).padStart(5, "0")}`;
}
