import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { READ_COLUMNS } from "@/lib/data/rows";
import { buildDemoPayload } from "@/features/onboarding/demo-data";
import { buildRequirements } from "@/features/documents/checklists";
import { instantiateSteps } from "@/features/workflows/instantiate";
import { templateForCategory } from "@/features/workflows/templates";

// Tests de la base sans Docker : les migrations sont appliquées à PGlite (PostgreSQL en mémoire),
// après une reproduction minimale de Supabase (supabase-stub.sql). Chaque requête s'exécute
// dans une transaction, sous le rôle « authenticated » et l'identité de la personne simulée.

const root = join(__dirname, "..");
const YEAR = new Date().getFullYear();

interface User {
  id: string;
  email: string;
  name: string;
  /** Niveau d'authentification du jeton : « aal2 » après la double authentification. */
  aal?: "aal1" | "aal2";
}

const user = (n: number, email: string, name: string): User => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, email, name });
const ALICE = user(1, "alice@agence-a.test", "Alice Owona");
const BRUNO = user(2, "bruno@agence-b.test", "Bruno Kamdem");
const CARINE = user(3, "carine@agence-a.test", "Carine Abena");
const VICTOR = user(4, "victor@agence-a.test", "Victor Mballa");
const DIANE = user(5, "diane@demo.test", "Diane Essomba");
const ERIC = user(6, "eric@agence-e.test", "Éric Fouda");
const FRANCK = user(7, "franck@essai.test", "Franck Nana");
const GRACE = user(8, "grace@select.test", "Grâce Ngo");
const GRACE_MFA: User = { ...GRACE, aal: "aal2" };
const HUGO = user(9, "hugo@agence-h.test", "Hugo Tchami");
const IRENE = user(10, "irene@agence-h.test", "Irène Bella");
const JULES = user(11, "jules@agence-h.test", "Jules Eto");
const KARL = user(12, "karl@agence-k.test", "Karl Biya");
const LINA = user(13, "lina@agence-k.test", "Lina Atangana");
const MAX = user(14, "max@agence-k.test", "Max Onana");
const NOAH = user(15, "noah@agence-k.test", "Noah Ekotto");
const OSCAR = user(16, "oscar@partenaire.test", "Oscar Mbida");

let db: PGlite;

async function as<T>(who: User | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (who) {
      const claims = { sub: who.id, email: who.email, role: "authenticated", aal: who.aal ?? "aal1", user_metadata: { full_name: who.name } };
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await tx.exec("set local role authenticated");
    } else {
      await tx.exec("set local role anon");
    }
    return fn(tx);
  });
}

async function one<T = Record<string, unknown>>(who: User | null, sql: string, params: unknown[] = []): Promise<T> {
  return as(who, async (tx) => (await tx.query<T>(sql, params)).rows[0]!);
}

async function rows<T = Record<string, unknown>>(who: User | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return as(who, async (tx) => (await tx.query<T>(sql, params)).rows);
}

const createOrg = (who: User, name: string, demo = false) =>
  one<{ id: string }>(who, "select public.create_organization($1, 'Douala', 'CM', 'XAF', 'Africa/Douala', 'REC', $2, 'Direction', $3) as id", [name, who.name, demo]).then((r) => r.id);

const memberId = (who: User) => one<{ id: string }>(who, "select id from public.members where user_id = auth.uid()").then((r) => r.id);

async function createClient(who: User, org: string, assignedTo: string, lastName = "Ndjock") {
  return one<{ id: string; reference: string }>(
    who,
    `insert into public.clients (organization_id, client_type, first_name, last_name, phone_e164, residence_country, city, assigned_to)
     values ($1, 'student', 'Paul', $2, '+237690000001', 'CM', 'Douala', $3) returning id, reference`,
    [org, lastName, assignedTo],
  );
}

async function createCase(who: User, org: string, clientId: string, assignedTo: string) {
  const template = templateForCategory("study_abroad");
  const steps = instantiateSteps("x", template).map((s) => ({
    position: s.position, key: s.key, label: s.label, kind: s.kind, is_optional: s.isOptional, outcome: s.outcome ?? null, next: s.next ?? null, status: s.status,
  }));
  const requirements = buildRequirements("x", "study_abroad", "FR", ["student"]).map((r) => ({
    document_type_code: r.documentTypeCode, label: r.label, category: r.category, is_required: r.isRequired,
  }));
  const payload = {
    organization_id: org, client_id: clientId, category: "study_abroad", title: "Master — Lyon", destination_country: "FR",
    residence_country: "CM", priority: "normal", assigned_to: assignedTo, billing_currency: "XAF", applicant_tags: ["student"], details: {}, template_key: template.key,
  };
  const result = await one<{ r: { id: string; reference: string } }>(
    who,
    "select public.create_case($1::jsonb, $2::jsonb, $3::jsonb, $4) as r",
    [JSON.stringify(payload), JSON.stringify(steps), JSON.stringify(requirements), template.name.toLowerCase()],
  );
  return { ...result.r, stepCount: steps.length, requirementCount: requirements.length };
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync(join(root, "tests", "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(join(root, "migrations")).sort()) {
    await db.exec(readFileSync(join(root, "migrations", file), "utf8"));
  }
  for (const u of [ALICE, BRUNO, CARINE, VICTOR, DIANE, ERIC, FRANCK, GRACE, HUGO, IRENE, JULES, KARL, LINA, MAX, NOAH, OSCAR]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
  }
}, 60_000);

describe("schéma", () => {
  it("contient toutes les colonnes lues par l'application", async () => {
    const existing = await db.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    );
    const set = new Set(existing.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing = Object.entries(READ_COLUMNS).flatMap(([table, cols]) => cols.names.filter((c) => !set.has(`${table}.${c}`)).map((c) => `${table}.${c}`));
    expect(missing).toEqual([]);
  });

  it("active la RLS sur toutes les tables de l'API", async () => {
    const result = await db.query<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
});

describe("agences et cloisonnement", () => {
  let orgA: string;
  let orgB: string;
  let alice: string;
  let bruno: string;
  let clientA: { id: string; reference: string };

  beforeAll(async () => {
    orgA = await createOrg(ALICE, "Agence A");
    orgB = await createOrg(BRUNO, "Agence B");
    alice = await memberId(ALICE);
    bruno = await memberId(BRUNO);
    clientA = await createClient(ALICE, orgA, alice);
  });

  it("refuse tout accès sans connexion", async () => {
    await expect(rows(null, "select id from public.clients")).rejects.toThrow(/permission denied/);
    await expect(rows(null, "select public.create_organization('X', '', 'CM', 'XAF', 'Africa/Douala', 'REC', 'X', '')")).rejects.toThrow(/permission denied/);
  });

  it("fait de la créatrice la propriétaire et refuse une seconde agence", async () => {
    const member = await one<{ role: string; email: string }>(ALICE, "select role, email from public.members where user_id = auth.uid()");
    expect(member).toEqual({ role: "owner", email: ALICE.email });
    await expect(createOrg(ALICE, "Autre agence")).rejects.toThrow(/déjà rattaché/);
  });

  it("numérote les clients par agence", async () => {
    expect(clientA.reference).toBe(`CLI-${YEAR}-00001`);
    const clientB = await createClient(BRUNO, orgB, bruno);
    expect(clientB.reference).toBe(`CLI-${YEAR}-00001`);
  });

  it("n'affiche jamais les données d'une autre agence", async () => {
    expect(await rows(BRUNO, "select id from public.clients where id = $1", [clientA.id])).toEqual([]);
    expect(await rows(BRUNO, "select id from public.organizations where id = $1", [orgA])).toEqual([]);
    expect(await rows(BRUNO, "select id from public.members where organization_id = $1", [orgA])).toEqual([]);
  });

  it("refuse d'écrire dans une autre agence", async () => {
    await expect(createClient(BRUNO, orgA, alice)).rejects.toThrow(/row-level security/);
    const updated = await rows(BRUNO, "update public.clients set notes = 'piraté' where id = $1 returning id", [clientA.id]);
    expect(updated).toEqual([]);
  });

  it("refuse de rattacher un dossier au client d'une autre agence", async () => {
    await expect(createCase(BRUNO, orgB, clientA.id, bruno)).rejects.toThrow(/foreign key/);
  });

  it("garde l'historique en ajout seul et impose l'auteur", async () => {
    await as(ALICE, (tx) =>
      tx.query("insert into public.activity_events (organization_id, actor_id, client_id, text) values ($1, $2, $3, 'Test')", [orgA, alice, clientA.id]),
    );
    const event = await one<{ id: string; actor_id: string }>(ALICE, "select id, actor_id from public.activity_events where text = 'Test'");
    expect(event.actor_id).toBe(alice);
    expect(await rows(ALICE, "update public.activity_events set text = 'Modifié' where id = $1 returning id", [event.id])).toEqual([]);
    expect(await rows(ALICE, "delete from public.activity_events where id = $1 returning id", [event.id])).toEqual([]);
  });
});

describe("dossiers, étapes et paiements", () => {
  let org: string;
  let owner: string;
  let caseId: string;
  let chargeId: string;

  beforeAll(async () => {
    org = await createOrg(ERIC, "Agence E");
    owner = await memberId(ERIC);
    const client = await createClient(ERIC, org, owner);
    const created = await createCase(ERIC, org, client.id, owner);
    caseId = created.id;
    expect(created.reference).toBe(`DOS-${YEAR}-00001`);
    const counts = await one<{ steps: number; requirements: number; events: number }>(
      ERIC,
      `select (select count(*)::int from public.case_steps where case_id = $1) as steps,
              (select count(*)::int from public.document_requirements where case_id = $1) as requirements,
              (select count(*)::int from public.activity_events where case_id = $1) as events`,
      [caseId],
    );
    expect(counts).toEqual({ steps: created.stepCount, requirements: created.requirementCount, events: 1 });
  });

  it("refuse un changement d'étape calculé sur une version périmée", async () => {
    const transition = (version: number) =>
      one<{ v: number }>(ERIC, "select public.apply_case_transition($1, $2, '[]'::jsonb, '{\"next_action\": \"Suite\"}'::jsonb, 'Étape') as v", [caseId, version]);
    expect((await transition(1)).v).toBe(2);
    await expect(transition(1)).rejects.toThrow(/modifié par une autre personne/);
  });

  it("impose la devise du dossier aux prestations", async () => {
    await expect(
      as(ERIC, (tx) => tx.query("insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Frais', 'agency_fee', 1000, 'EUR')", [org, caseId])),
    ).rejects.toThrow(/devise du dossier/);
    chargeId = (
      await one<{ id: string }>(ERIC, "insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Accompagnement', 'agency_fee', 500000, 'XAF') returning id", [org, caseId])
    ).id;
  });

  const pay = (amount: number, allocations: { charge_id: string; amount_minor: number }[]) =>
    one<{ r: { receipt_number: string } }>(
      ERIC,
      "select public.record_payment($1, $2, 'mobile_money', 'Orange Money', 'OM-1', 'Paul', now(), $3::jsonb, 'Paiement (reçu {recu}).') as r",
      [caseId, amount, JSON.stringify(allocations)],
    );

  it("numérote les reçus sans trou et refuse les dépassements", async () => {
    expect((await pay(200000, [{ charge_id: chargeId, amount_minor: 200000 }])).r.receipt_number).toBe(`REC-${YEAR}-00001`);
    await expect(pay(400000, [{ charge_id: chargeId, amount_minor: 400000 }])).rejects.toThrow(/dépasse le reste à payer/);
    await expect(pay(100000, [{ charge_id: chargeId, amount_minor: 50000 }])).rejects.toThrow(/ne correspond pas/);
    expect((await pay(300000, [{ charge_id: chargeId, amount_minor: 300000 }])).r.receipt_number).toBe(`REC-${YEAR}-00002`);
    const event = await one<{ text: string }>(ERIC, "select text from public.activity_events where text like 'Paiement%' order by at desc limit 1");
    expect(event.text).toMatch(/^Paiement \(reçu REC-\d{4}-0000[12]\)\.$/);
  });

  it("n'autorise l'écriture d'un paiement que par record_payment", async () => {
    await expect(
      as(ERIC, (tx) =>
        tx.query(
          "insert into public.payments (organization_id, case_id, client_id, amount_minor, currency, method_kind, method_label, paid_at, received_by, receipt_number) select organization_id, id, client_id, 1, 'XAF', 'cash', 'Espèces', now(), assigned_to, 'X' from public.cases where id = $1",
          [caseId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("n'accepte que des fichiers déposés dans le dossier de l'agence", async () => {
    const req = await one<{ id: string }>(ERIC, "select id from public.document_requirements where case_id = $1 limit 1", [caseId]);
    const path = `${org}/${caseId}/${req.id}/1-passeport.pdf`;
    await expect(one(ERIC, "select public.register_requirement_file($1, $2, 'passeport.pdf', 'Reçu') as r", [req.id, path])).rejects.toThrow(/pas été reçu/);
    await as(ERIC, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [path]));
    await expect(as(BRUNO, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${org}/${caseId}/${req.id}/2-x.pdf`]))).rejects.toThrow(/row-level security/);
    expect(await rows(BRUNO, "select id from storage.objects where name = $1", [path])).toEqual([]);
    await one(ERIC, "select public.register_requirement_file($1, $2, 'passeport.pdf', 'Reçu') as r", [req.id, path]);
    const after = await one<{ status: string; storage_path: string }>(ERIC, "select status, storage_path from public.document_requirements where id = $1", [req.id]);
    expect(after).toEqual({ status: "received", storage_path: path });
  });

  it("garde plusieurs fichiers par pièce, et remet la pièce à vérifier quand ils changent", async () => {
    // Une pièce encore sans fichier (celle du test précédent en a un ; created_at est le même pour toutes).
    const req = await one<{ id: string }>(ERIC, "select id from public.document_requirements where case_id = $1 and storage_path is null order by id limit 1", [caseId]);
    const path = (n: number) => `${org}/${caseId}/${req!.id}/${n}-releve.pdf`;
    for (const n of [1, 2, 3]) await as(ERIC, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('documents', $1)", [path(n)]));
    const add = (who: User, n: number) => one<{ id: string }>(who, "select public.add_requirement_file($1, $2, $3, 'Fichier ajouté.') as id", [req!.id, path(n), `releve-${n}.pdf`]);
    const state = () => one<{ status: string; storage_path: string | null; files: number }>(ERIC, "select status, storage_path, (select count(*)::int from public.document_files f where f.requirement_id = r.id) as files from public.document_requirements r where r.id = $1", [req!.id]);

    await expect(add(BRUNO, 1)).rejects.toThrow(/introuvable/);
    const first = (await add(ERIC, 1)).id;
    expect(await state()).toEqual({ status: "received", storage_path: path(1), files: 1 });
    await one(ERIC, "select public.review_requirement($1, 'validated', null, 'Vérifiée')", [req!.id]);
    await add(ERIC, 2);
    expect(await state()).toEqual({ status: "received", storage_path: path(2), files: 2 });
    expect(await rows(BRUNO, "select id from public.document_files")).toEqual([]);

    const second = (await one<{ id: string }>(ERIC, "select id from public.document_files where storage_path = $1", [path(2)])).id;
    await expect(one(BRUNO, "select public.remove_requirement_file($1, 'x')", [second])).rejects.toThrow(/introuvable/);
    expect((await one<{ p: string }>(ERIC, "select public.remove_requirement_file($1, 'Fichier retiré.') as p", [second])).p).toBe(path(2));
    expect(await state()).toEqual({ status: "received", storage_path: path(1), files: 1 });
    await one(ERIC, "select public.remove_requirement_file($1, 'Fichier retiré.')", [first]);
    expect(await state()).toEqual({ status: "not_received", storage_path: null, files: 0 });

    await one(ERIC, "select public.update_requirement($1, 'Relevés bancaires (6 mois)', false, '2030-01-31', 'Pièce modifiée.')", [req!.id]);
    expect(await one(ERIC, "select label, is_required, expires_at::text from public.document_requirements where id = $1", [req!.id])).toEqual({
      label: "Relevés bancaires (6 mois)", is_required: false, expires_at: "2030-01-31",
    });
    await expect(one(BRUNO, "select public.update_requirement($1, 'Piraté', true, null, 'x')", [req!.id])).rejects.toThrow(/introuvable/);

    await add(ERIC, 3);
    const removed = await one<{ p: string[] }>(ERIC, "select public.delete_requirement($1, 'Pièce retirée.') as p", [req!.id]);
    expect(removed.p).toEqual([path(3)]);
    expect(await rows(ERIC, "select id from public.document_requirements where id = $1", [req!.id])).toEqual([]);
    expect(await rows(ERIC, "select id from public.document_files where storage_path = $1", [path(3)])).toEqual([]);
  });

  it("annule un paiement avec son motif et libère le reste à payer", async () => {
    const first = await one<{ id: string }>(ERIC, "select id from public.payments where receipt_number = $1", [`REC-${YEAR}-00001`]);
    const voidPayment = (who: User, reason: string) => one(who, "select public.void_payment($1, $2, 'Paiement annulé.')", [first.id, reason]);
    await expect(voidPayment(BRUNO, "Erreur de saisie")).rejects.toThrow(/introuvable/);
    await expect(voidPayment(ERIC, " ")).rejects.toThrow(/motif/);
    await voidPayment(ERIC, "Erreur de saisie");
    expect(await one(ERIC, "select status, void_reason from public.payments where id = $1", [first.id])).toEqual({ status: "voided", void_reason: "Erreur de saisie" });
    await expect(voidPayment(ERIC, "Encore")).rejects.toThrow(/déjà annulé/);
    // Le numéro du reçu annulé n'est jamais réutilisé.
    expect((await pay(200000, [{ charge_id: chargeId, amount_minor: 200000 }])).r.receipt_number).toBe(`REC-${YEAR}-00003`);
  });

  it("transforme un devis accepté en prestations du dossier", async () => {
    const items = [
      { label: "Frais de dossier", charge_type: "agency_fee", quantity: 2, unit_amount_minor: 100000 },
      { label: "Frais de visa", charge_type: "third_party", quantity: 1, unit_amount_minor: 50000 },
    ];
    const quote = (
      await one<{ r: { id: string; reference: string } }>(ERIC, "select public.create_quote($1, null, 'Valable 30 jours', $2::jsonb, 'Devis {devis} préparé.') as r", [caseId, JSON.stringify(items)])
    ).r;
    expect(quote.reference).toBe(`DEV-${YEAR}-00001`);
    expect(await rows(BRUNO, "select id from public.quotes")).toEqual([]);
    await expect(one(ERIC, "select public.create_quote($1, null, null, '[]'::jsonb, 'x')", [caseId])).rejects.toThrow(/au moins une ligne/);

    const status = (s: string) => one(ERIC, "select public.set_quote_status($1, $2, 'Devis {devis} mis à jour.')", [quote.id, s]);
    await expect(status("refused")).rejects.toThrow(/ne peut plus/);
    await status("sent");
    const before = (await one<{ n: number }>(ERIC, "select count(*)::int as n from public.charges where case_id = $1", [caseId])).n;
    await status("accepted");
    const charges = await rows<{ label: string; amount_minor: string; charge_type: string }>(
      ERIC,
      "select label, amount_minor::text, charge_type from public.charges where case_id = $1 order by created_at desc limit 2",
      [caseId],
    );
    expect((await one<{ n: number }>(ERIC, "select count(*)::int as n from public.charges where case_id = $1", [caseId])).n).toBe(before + 2);
    expect(charges).toContainEqual({ label: "Frais de dossier (× 2)", amount_minor: "200000", charge_type: "agency_fee" });
    expect(charges).toContainEqual({ label: "Frais de visa", amount_minor: "50000", charge_type: "third_party" });
    await expect(status("cancelled")).rejects.toThrow(/ne peut plus/);
    const event = await one<{ text: string }>(ERIC, "select text from public.activity_events where case_id = $1 order by at desc limit 1", [caseId]);
    expect(event.text).toBe(`Devis DEV-${YEAR}-00001 mis à jour.`);
  });

  it("garde un paiement annoncé sans reçu jusqu'à sa vérification", async () => {
    const charge = (
      await one<{ id: string }>(ERIC, "insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Logement', 'agency_fee', 100000, 'XAF') returning id", [org, caseId])
    ).id;
    const record = (amount: number, pending: boolean) =>
      one<{ r: { id: string; receipt_number: string | null; status: string } }>(
        ERIC,
        "select public.record_payment($1, $2, 'bank_transfer', 'Virement bancaire', 'VIR-9', 'Paul', now(), $3::jsonb, 'Paiement saisi.', $4) as r",
        [caseId, amount, JSON.stringify([{ charge_id: charge, amount_minor: amount }]), pending],
      ).then((x) => x.r);

    const announced = await record(60000, true);
    expect(announced).toMatchObject({ receipt_number: null, status: "pending" });
    // Sa part est réservée : 60 000 annoncés + 50 000 dépasseraient les 100 000 de la prestation.
    await expect(record(50000, false)).rejects.toThrow(/en attente de vérification compris/);

    const confirm = (who: User) => one<{ r: { receipt_number: string } }>(who, "select public.confirm_payment($1, 'Paiement vérifié (reçu {recu}).') as r", [announced.id]).then((x) => x.r);
    await expect(confirm(BRUNO)).rejects.toThrow(/introuvable/);
    expect((await confirm(ERIC)).receipt_number).toBe(`REC-${YEAR}-00004`);
    expect(await one(ERIC, "select status, confirmed_at is not null as confirmed from public.payments where id = $1", [announced.id])).toEqual({ status: "recorded", confirmed: true });
    await expect(confirm(ERIC)).rejects.toThrow(/plus en attente/);
    const event = await one<{ text: string }>(ERIC, "select text from public.activity_events where case_id = $1 order by at desc limit 1", [caseId]);
    expect(event.text).toBe(`Paiement vérifié (reçu REC-${YEAR}-00004).`);

    // Annoncé mais jamais arrivé : annulé sans reçu, sa part redevient disponible.
    const lost = await record(40000, true);
    await one(ERIC, "select public.void_payment($1, 'Virement jamais reçu', 'Paiement annulé.')", [lost.id]);
    expect(await one(ERIC, "select status, receipt_number from public.payments where id = $1", [lost.id])).toEqual({ status: "voided", receipt_number: null });
    expect((await record(40000, false)).receipt_number).toBe(`REC-${YEAR}-00005`);
    expect(await one(ERIC, "select count(*)::int as n from public.payments where status = 'recorded' and confirmed_at is null")).toEqual({ n: 0 });
  });
});

describe("invitations et rôles", () => {
  let orgA: string;
  let token: string;
  let viewerToken: string;

  beforeAll(async () => {
    orgA = (await one<{ id: string }>(ALICE, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    const alice = await memberId(ALICE);
    token = (await one<{ token: string }>(ALICE, "insert into public.invitations (organization_id, email, role, invited_by) values ($1, $2, 'agent', $3) returning token", [orgA, CARINE.email, alice])).token;
    viewerToken = (await one<{ token: string }>(ALICE, "insert into public.invitations (organization_id, email, role, invited_by) values ($1, $2, 'viewer', $3) returning token", [orgA, VICTOR.email, alice])).token;
  });

  it("montre l'invitation sans connexion, mais ne l'accepte que pour la bonne adresse", async () => {
    expect(await one(null, "select agency_name, role, status from public.get_invitation($1)", [token])).toEqual({ agency_name: "Agence A", role: "agent", status: "pending" });
    await expect(one(VICTOR, "select public.accept_invitation($1)", [token])).rejects.toThrow(/autre adresse/);
    expect((await rows(CARINE, "select token from public.my_invitations()")).length).toBe(1);
    await one(CARINE, "select public.accept_invitation($1)", [token]);
    await expect(one(CARINE, "select public.accept_invitation($1)", [token])).rejects.toThrow(/déjà été utilisée/);
  });

  it("donne au conseiller l'accès aux dossiers, pas aux paramètres", async () => {
    const carine = await memberId(CARINE);
    expect((await createClient(CARINE, orgA, carine, "Mvogo")).reference).toMatch(/^CLI-/);
    expect(await rows(CARINE, "update public.organizations set name = 'Renommée' where id = $1 returning id", [orgA])).toEqual([]);
    expect(await rows(CARINE, "select id from public.invitations")).toEqual([]);
  });

  it("laisse la lecture seule consulter sans modifier ni voir la finance", async () => {
    await one(VICTOR, "select public.accept_invitation($1)", [viewerToken]);
    expect((await rows(VICTOR, "select id from public.clients")).length).toBeGreaterThan(0);
    await expect(createClient(VICTOR, orgA, await memberId(VICTOR))).rejects.toThrow(/row-level security/);
    const alice = await memberId(ALICE);
    const client = await one<{ id: string }>(ALICE, "select id from public.clients limit 1");
    const created = await createCase(ALICE, orgA, client.id, alice);
    await as(ALICE, (tx) => tx.query("insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Frais', 'agency_fee', 1000, 'XAF')", [orgA, created.id]));
    expect((await rows(ALICE, "select id from public.charges")).length).toBe(1);
    await as(ALICE, (tx) => tx.query("insert into public.client_sensitive (client_id, organization_id, id_doc_number) values ($1, $2, 'AB123456')", [client.id, orgA]));
    expect((await rows(CARINE, "select id_doc_number from public.client_sensitive")).length).toBe(1);
    expect(await rows(VICTOR, "select id_doc_number from public.client_sensitive")).toEqual([]);
    expect(await rows(VICTOR, "select id from public.charges")).toEqual([]);
    expect((await rows(VICTOR, "select id from public.cases")).length).toBe(1);
  });
});

describe("agence de démonstration", () => {
  it("importe les données fictives en entier, avec des numéros qui continuent ensuite", async () => {
    const owner = crypto.randomUUID();
    const payload = buildDemoPayload(owner, "2026-11-15");
    const { id: org } = await one<{ id: string }>(DIANE, "select public.create_demo_organization('Démo Horizon', $1, $2, $3::jsonb) as id", [DIANE.name, owner, JSON.stringify(payload)]);
    expect(await memberId(DIANE)).toBe(owner);

    const counts = await one<Record<string, number>>(
      DIANE,
      `select (select count(*)::int from public.members) as members, (select count(*)::int from public.clients) as clients,
              (select count(*)::int from public.cases) as cases, (select count(*)::int from public.payments) as payments,
              (select count(*)::int from public.payment_allocations) as allocations, (select count(*)::int from public.activity_events) as events`,
    );
    expect(counts).toEqual({
      members: payload.members.length + 1,
      clients: payload.clients.length,
      cases: payload.cases.length,
      payments: payload.payments.length,
      allocations: payload.payment_allocations.length,
      events: payload.activity_events.length,
    });
    // Les dates sont décalées du même nombre de jours que « aujourd'hui » (18 jours ici).
    const opened = await one<{ opened_at: Date }>(DIANE, "select opened_at from public.cases where reference = 'DOS-2026-00117'");
    expect(opened.opened_at.toISOString().slice(0, 10)).toBe("2026-10-03");
    expect((await createClient(DIANE, org, owner)).reference).toBe(`CLI-${YEAR}-00048`);
    await expect(one(DIANE, "select public.import_demo_data($1, $2::jsonb)", [org, JSON.stringify(payload)])).rejects.toThrow(/déjà des données/);
  });

  it("n'est créée que si l'import réussit", async () => {
    const payload = buildDemoPayload(crypto.randomUUID(), "2026-11-15");
    (payload.clients[0] as Record<string, unknown>).client_type = "inconnu";
    await expect(one(FRANCK, "select public.create_demo_organization('Démo', $1, $2, $3::jsonb)", [FRANCK.name, crypto.randomUUID(), JSON.stringify(payload)])).rejects.toThrow(/check constraint/);
    expect(await rows(FRANCK, "select id from public.members where user_id = auth.uid()")).toEqual([]);
  });

  it("se quitte pour créer ensuite sa vraie agence", async () => {
    await one(DIANE, "select public.leave_demo_organization()");
    expect(await rows(DIANE, "select id from public.clients")).toEqual([]);
    expect(await createOrg(DIANE, "Vraie agence")).toMatch(/^[0-9a-f-]{36}$/);
    await expect(one(DIANE, "select public.leave_demo_organization()")).rejects.toThrow(/démonstration/);
  });

  it("refuse l'import dans une agence réelle", async () => {
    const orgA = (await one<{ id: string }>(ALICE, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    await expect(one(ALICE, "select public.import_demo_data($1, '{}'::jsonb)", [orgA])).rejects.toThrow(/agence de démonstration/);
  });
});

describe("équipe", () => {
  let orgH: string;
  let hugo: string;

  beforeAll(async () => {
    orgH = await createOrg(HUGO, "Agence H");
    hugo = await memberId(HUGO);
    for (const [who, role] of [[IRENE, "agent"], [JULES, "accountant"]] as const) {
      const { token } = await one<{ token: string }>(
        HUGO,
        "insert into public.invitations (organization_id, email, role, invited_by) values ($1, $2, $3, $4) returning token",
        [orgH, who.email, role, hugo],
      );
      await one(who, "select public.accept_invitation($1)", [token]);
    }
  });

  const setRole = (who: User, target: string, role: string) => one(who, "select public.update_member_role($1, $2, 'Rôle modifié.')", [target, role]);

  it("change un rôle, sauf le sien et celui du propriétaire", async () => {
    const irene = await memberId(IRENE);
    await expect(setRole(IRENE, await memberId(JULES), "viewer")).rejects.toThrow(/réservée aux responsables/);
    await setRole(HUGO, irene, "admin");
    await expect(setRole(IRENE, hugo, "agent")).rejects.toThrow(/propriétaire/);
    await expect(setRole(IRENE, irene, "agent")).rejects.toThrow(/propre rôle/);
    await expect(setRole(HUGO, irene, "owner")).rejects.toThrow(/transfert de propriété/);
    await expect(setRole(BRUNO, irene, "viewer")).rejects.toThrow(/introuvable/);
    await setRole(HUGO, irene, "agent");
    expect((await one<{ role: string }>(HUGO, "select role from public.members where id = $1", [irene])).role).toBe("agent");
  });

  it("retire un collaborateur : ses dossiers passent à un autre et son accès disparaît aussitôt", async () => {
    const irene = await memberId(IRENE);
    const jules = await memberId(JULES);
    const client = await createClient(IRENE, orgH, irene, "Ondoa");
    const created = await createCase(IRENE, orgH, client.id, irene);
    const remove = (who: User, heir: string) => one(who, "select public.remove_member($1, $2, 'Membre retiré.')", [irene, heir]);
    await expect(one(JULES, "select public.remove_member($1, $2, 'x')", [irene, hugo])).rejects.toThrow(/réservée aux responsables/);
    await expect(remove(HUGO, jules)).rejects.toThrow(/reprend/);
    await expect(one(HUGO, "select public.remove_member($1, $2, 'x')", [hugo, jules])).rejects.toThrow(/vous-même/);
    await remove(HUGO, hugo);

    expect(await rows(IRENE, "select id from public.clients")).toEqual([]);
    expect(await rows(IRENE, "select id from public.members where user_id = auth.uid()")).toEqual([]);
    expect((await one<{ assigned_to: string }>(HUGO, "select assigned_to from public.cases where id = $1", [created.id])).assigned_to).toBe(hugo);
    expect((await one<{ assigned_to: string }>(HUGO, "select assigned_to from public.clients where id = $1", [client.id])).assigned_to).toBe(hugo);
    const removed = await one<{ user_id: string | null; removed: boolean }>(HUGO, "select user_id, removed_at is not null as removed from public.members where id = $1", [irene]);
    expect(removed).toEqual({ user_id: null, removed: true });
    await expect(remove(HUGO, hugo)).rejects.toThrow(/introuvable/);
  });

  it("transfère la propriété à un autre membre", async () => {
    const jules = await memberId(JULES);
    await expect(one(JULES, "select public.transfer_ownership($1, 'x')", [hugo])).rejects.toThrow(/réservée au propriétaire/);
    await one(HUGO, "select public.transfer_ownership($1, 'Propriété transmise.')", [jules]);
    expect(await rows(HUGO, "select role from public.members where organization_id = $1 and removed_at is null order by role", [orgH])).toEqual([{ role: "admin" }, { role: "owner" }]);
    await one(JULES, "select public.transfer_ownership($1, 'Propriété transmise.')", [hugo]);
    expect((await one<{ role: string }>(HUGO, "select role from public.members where user_id = auth.uid()")).role).toBe("owner");
  });

  it("ne laisse modifier que les paramètres prévus de l'agence", async () => {
    await expect(rows(HUGO, "update public.organizations set is_demo = true where id = $1 returning id", [orgH])).rejects.toThrow(/permission denied/);
    expect(await rows(HUGO, "update public.organizations set name = 'Agence H' where id = $1 returning id", [orgH])).toEqual([{ id: orgH }]);
  });
});

describe("abonnements et console SELECT", () => {
  let orgH: string;

  beforeAll(async () => {
    orgH = (await one<{ id: string }>(HUGO, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    await db.query("insert into private.platform_admins (user_id) values ($1)", [GRACE.id]);
  });

  const setSubscription = (status: string, trialEnds: string | null = null, plan: string | null = null) =>
    one(GRACE_MFA, "select public.platform_update_subscription($1, $2, $3, $4, null, 'Test de la console')", [orgH, plan, status, trialEnds]);

  it("ouvre un essai de 30 jours à la création d'une agence réelle", async () => {
    const sub = await one<{ status: string; days: number }>(HUGO, "select status, round(extract(epoch from trial_ends_at - now()) / 86400)::int as days from public.subscriptions");
    expect(sub).toEqual({ status: "trialing", days: 30 });
    const demo = await db.query<{ n: number }>("select count(*)::int as n from public.subscriptions s join public.organizations o on o.id = s.organization_id where o.is_demo");
    expect(demo.rows[0]!.n).toBe(0);
  });

  it("réserve la console aux administrateurs SELECT avec double authentification", async () => {
    expect((await one<{ a: string }>(ALICE, "select public.platform_access() as a")).a).toBe("none");
    expect((await one<{ a: string }>(GRACE, "select public.platform_access() as a")).a).toBe("mfa");
    expect((await one<{ a: string }>(GRACE_MFA, "select public.platform_access() as a")).a).toBe("ok");
    await expect(rows(ALICE, "select * from public.platform_agencies()")).rejects.toThrow(/équipe SELECT/);
    await expect(rows(GRACE, "select * from public.platform_agencies()")).rejects.toThrow(/équipe SELECT/);
    await expect(rows(null, "select public.platform_access()")).rejects.toThrow(/permission denied/);
    await expect(rows(null, "select id from public.plans")).rejects.toThrow(/permission denied/);
    const agencies = await rows(GRACE_MFA, "select name, status, members from public.platform_agencies() where id = $1", [orgH]);
    expect(agencies).toEqual([{ name: "Agence H", status: "trialing", members: 2 }]);
    const overview = await one<{ o: { users: number } }>(GRACE_MFA, "select public.platform_overview() as o");
    expect(overview.o.users).toBe(16);
  });

  it("ne donne à la console aucun accès direct aux données des agences", async () => {
    for (const table of ["clients", "cases", "members", "organizations", "payments", "subscriptions", "support_tickets"]) {
      expect(await rows(GRACE_MFA, `select * from public.${table}`)).toEqual([]);
    }
  });

  it("met une agence suspendue en lecture seule, sans lui couper le support", async () => {
    const hugo = await memberId(HUGO);
    await setSubscription("suspended");
    await expect(createClient(HUGO, orgH, hugo)).rejects.toThrow(/row-level security/);
    expect((await rows(HUGO, "select id from public.clients")).length).toBeGreaterThan(0);
    expect(await rows(HUGO, "update public.organizations set name = 'Renommée' where id = $1 returning id", [orgH])).toEqual([]);
    const ticket = await one<{ r: { reference: string } }>(HUGO, "select public.create_support_ticket('Réactivation', 'billing', 'Nous avons payé par Orange Money.') as r");
    expect(ticket.r.reference).toBe(`SUP-${YEAR}-00001`);

    await one(GRACE_MFA, "select public.platform_record_subscription_payment($1, null, 1500000, 'XAF', 'mobile_money', 'OM-42', now(), now() + interval '1 month')", [orgH]);
    expect((await one<{ status: string }>(HUGO, "select status from public.subscriptions")).status).toBe("active");
    expect((await createClient(HUGO, orgH, hugo, "Abena")).reference).toMatch(/^CLI-/);
    const actions = (await rows<{ action: string }>(GRACE_MFA, "select action from public.platform_audit($1)", [orgH])).map((r) => r.action);
    expect(actions).toEqual(["subscription_payment.recorded", "subscription.updated"]);
  });

  it("passe l'agence en lecture seule à la fin de l'essai", async () => {
    const hugo = await memberId(HUGO);
    await setSubscription("trialing", new Date(Date.now() - 86400_000).toISOString());
    await expect(createClient(HUGO, orgH, hugo)).rejects.toThrow(/row-level security/);
    await setSubscription("active");
    expect((await createClient(HUGO, orgH, hugo, "Ngono")).reference).toMatch(/^CLI-/);
  });

  it("applique la limite de membres de la formule", async () => {
    const hugo = await memberId(HUGO);
    const plan = (await one<{ id: string }>(GRACE_MFA, "select public.platform_save_plan(null, 'Essentiel', '', 1500000, 'XAF', 'monthly', 2, true) as id")).id;
    await setSubscription("active", null, plan);
    expect((await rows<{ name: string }>(HUGO, "select name from public.plans")).map((p) => p.name)).toEqual(["Essentiel"]);
    const invite = () =>
      one(HUGO, "insert into public.invitations (organization_id, email, role, invited_by) values ($1, 'nouveau@agence-h.test', 'agent', $2) returning id", [orgH, hugo]);
    await expect(invite()).rejects.toThrow(/formule permet 2 membres/);
    await one(GRACE_MFA, "select public.platform_save_plan($1, 'Essentiel', '', 1500000, 'XAF', 'monthly', null, true)", [plan]);
    await invite();
  });

  it("garde les demandes de support séparées par agence", async () => {
    const [ticket] = await rows<{ id: string; status: string }>(GRACE_MFA, "select id, status from public.platform_tickets('open', null)");
    expect(ticket!.status).toBe("open");
    expect(await rows(ALICE, "select id from public.support_tickets")).toEqual([]);
    await expect(one(ALICE, "select public.reply_support_ticket($1, 'Intrusion')", [ticket!.id])).rejects.toThrow(/introuvable/);
    await one(GRACE_MFA, "select public.platform_reply_ticket($1, 'Paiement reçu, agence réactivée.', 'answered')", [ticket!.id]);
    const messages = await rows(HUGO, "select author_kind, author_name from public.support_messages order by created_at");
    expect(messages).toEqual([
      { author_kind: "agency", author_name: HUGO.name },
      { author_kind: "platform", author_name: "Équipe SELECT" },
    ]);
    await one(HUGO, "select public.reply_support_ticket($1, 'Merci !')", [ticket!.id]);
    expect((await one<{ status: string }>(HUGO, "select status from public.support_tickets")).status).toBe("open");
    await expect(one(GRACE, "select public.platform_reply_ticket($1, 'x', 'answered')", [ticket!.id])).rejects.toThrow(/équipe SELECT/);
  });
});

describe("factures", () => {
  let org: string;
  let clientId: string;
  let otherClientId: string;
  let caseId: string;

  beforeAll(async () => {
    org = await createOrg(KARL, "Agence K");
    const karl = await memberId(KARL);
    for (const [who, role] of [[LINA, "agent"], [MAX, "accountant"], [NOAH, "viewer"]] as const) {
      const { token } = await one<{ token: string }>(
        KARL,
        "insert into public.invitations (organization_id, email, role, invited_by) values ($1, $2, $3, $4) returning token",
        [org, who.email, role, karl],
      );
      await one(who, "select public.accept_invitation($1)", [token]);
    }
    clientId = (await createClient(KARL, org, karl, "Mbarga")).id;
    otherClientId = (await createClient(KARL, org, karl, "Essomba")).id;
    caseId = (await createCase(KARL, org, clientId, karl)).id;
  });

  const ITEMS = [
    { label: "Accompagnement Campus France", quantity: 2, unit_amount_minor: 150000, tax_rate: 19.25 },
    { label: "Frais de dossier", quantity: 1, unit_amount_minor: 25000, tax_rate: 0 },
  ];

  const save = (who: User, opts: { id?: string | null; client?: string; caseId?: string | null; discount?: number; issue?: boolean; items?: unknown[]; due?: string } = {}) =>
    one<{ r: { id: string; number: string; status: string } }>(
      who,
      "select public.save_invoice($1, $2, $3, 'XAF', '2026-11-02', $4, 'Remise fidélité', $5, 'Orange Money : 690 00 00 00', null, $6, $7::jsonb, 'Facture {facture} enregistrée.') as r",
      [opts.id ?? null, opts.client ?? clientId, opts.caseId === undefined ? caseId : opts.caseId, opts.due ?? "2026-11-30", opts.discount ?? 0, opts.issue ?? false, JSON.stringify(opts.items ?? ITEMS)],
    ).then((x) => x.r);

  it("enregistre les coordonnées et les images des factures, réservées aux responsables", async () => {
    const settings = JSON.stringify({ legal_name: "Agence K SARL", tax_id: "NIU M0123", payment_details: "Banque X — 0001" });
    await expect(one(LINA, "select public.save_invoice_settings($1, $2::jsonb)", [org, settings])).rejects.toThrow(/propriétaire et les administrateurs/);
    await expect(one(BRUNO, "select public.save_invoice_settings($1, $2::jsonb)", [org, settings])).rejects.toThrow(/propriétaire et les administrateurs/);
    await one(KARL, "select public.save_invoice_settings($1, $2::jsonb)", [org, settings]);
    expect(await one(LINA, "select legal_name, tax_id, address from public.invoice_settings")).toEqual({ legal_name: "Agence K SARL", tax_id: "NIU M0123", address: "" });
    expect(await rows(BRUNO, "select organization_id from public.invoice_settings where organization_id = $1", [org])).toEqual([]);
    expect(await rows(NOAH, "select organization_id from public.invoice_settings")).toEqual([]);

    const logo = (n: number) => `${org}/logo-${n}.png`;
    await expect(as(LINA, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('branding', $1)", [logo(1)]))).rejects.toThrow(/row-level security/);
    await expect(as(BRUNO, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('branding', $1)", [logo(1)]))).rejects.toThrow(/row-level security/);
    await expect(one(KARL, "select public.set_invoice_image($1, 'logo', $2)", [org, logo(1)])).rejects.toThrow(/pas été reçue/);
    for (const n of [1, 2]) await as(KARL, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('branding', $1)", [logo(n)]));
    await expect(one(KARL, "select public.set_invoice_image($1, 'stamp', $2)", [org, logo(1)])).rejects.toThrow(/pas été reçue/);
    expect((await one<{ old: string | null }>(KARL, "select public.set_invoice_image($1, 'logo', $2) as old", [org, logo(1)])).old).toBeNull();
    expect((await one<{ old: string | null }>(KARL, "select public.set_invoice_image($1, 'logo', $2) as old", [org, logo(2)])).old).toBe(logo(1));
    expect((await rows(MAX, "select name from storage.objects where bucket_id = 'branding'")).length).toBe(2);
    expect(await rows(BRUNO, "select name from storage.objects where bucket_id = 'branding'")).toEqual([]);
    expect(await rows(NOAH, "select name from storage.objects where bucket_id = 'branding'")).toEqual([]);
    expect((await one<{ old: string | null }>(KARL, "select public.set_invoice_image($1, 'logo', '') as old", [org])).old).toBe(logo(2));
    expect((await one<{ logo_path: string | null }>(KARL, "select logo_path from public.invoice_settings")).logo_path).toBeNull();
  });

  it("numérote la facture et recalcule ses montants dans la base", async () => {
    const draft = await save(LINA, { discount: 15000 });
    expect(draft).toMatchObject({ number: `FAC-${YEAR}-00001`, status: "draft" });
    // 2 × 150 000 = 300 000 ; taxe 19,25 % = 57 750 ; + 25 000 ; − 15 000 de remise.
    expect(await one(MAX, "select subtotal_minor::int as s, tax_minor::int as t, total_minor::int as total, discount_label from public.invoices where id = $1", [draft.id])).toEqual({
      s: 325000, t: 57750, total: 367750, discount_label: "Remise fidélité",
    });
    expect(await rows(MAX, "select label, quantity, tax_rate::text from public.invoice_items where invoice_id = $1 order by position", [draft.id])).toEqual([
      { label: "Accompagnement Campus France", quantity: 2, tax_rate: "19.25" },
      { label: "Frais de dossier", quantity: 1, tax_rate: "0.00" },
    ]);
    expect(await rows(BRUNO, "select id from public.invoices")).toEqual([]);
    expect(await rows(NOAH, "select id from public.invoices")).toEqual([]);
    expect(await rows(NOAH, "select id from public.invoice_items")).toEqual([]);
    await expect(as(KARL, (tx) => tx.query("update public.invoices set total_minor = 1 where id = $1", [draft.id]))).rejects.toThrow(/permission denied/);
    const event = await one<{ text: string }>(KARL, "select text from public.activity_events where case_id = $1 order by at desc limit 1", [caseId]);
    expect(event.text).toBe(`Facture FAC-${YEAR}-00001 enregistrée.`);
  });

  it("refuse les factures incohérentes et celles d'une autre agence", async () => {
    await expect(save(BRUNO)).rejects.toThrow(/Client introuvable/);
    await expect(save(NOAH)).rejects.toThrow(/Client introuvable/);
    await expect(save(KARL, { client: otherClientId })).rejects.toThrow(/n'appartient pas à ce client/);
    await expect(save(KARL, { due: "2026-10-01" })).rejects.toThrow(/échéance/);
    await expect(save(KARL, { items: [] })).rejects.toThrow(/au moins une ligne/);
    await expect(save(KARL, { items: [{ label: "Visa", quantity: 0, unit_amount_minor: 1000, tax_rate: 0 }] })).rejects.toThrow(/quantité, un prix ou une taxe/);
    await expect(save(KARL, { discount: 400000 })).rejects.toThrow(/remise ne peut pas dépasser/);
    const [draft] = await rows<{ id: string }>(KARL, "select id from public.invoices");
    await expect(save(BRUNO, { id: draft!.id })).rejects.toThrow(/Facture introuvable/);
    // Une tentative refusée ne consomme pas de numéro.
    expect((await save(KARL, { client: otherClientId, caseId: null })).number).toBe(`FAC-${YEAR}-00002`);
  });

  it("modifie, émet, verrouille une facture payée et ne supprime que sur décision d'un responsable", async () => {
    const id = (await one<{ id: string }>(KARL, "select id from public.invoices where number = $1", [`FAC-${YEAR}-00001`])).id;
    const edited = await save(LINA, { id, issue: true, items: [{ label: "Accompagnement visa", quantity: 1, unit_amount_minor: 200000, tax_rate: 0 }] });
    expect(edited).toEqual({ id, number: `FAC-${YEAR}-00001`, status: "issued" });
    expect(await one(KARL, "select total_minor::int as total, (select count(*)::int from public.invoice_items where invoice_id = $1) as lines from public.invoices where id = $1", [id])).toEqual({ total: 200000, lines: 1 });

    const status = (who: User, s: string) => one(who, "select public.set_invoice_status($1, $2, 'Facture {facture} : état modifié.')", [id, s]);
    await expect(status(KARL, "draft")).rejects.toThrow(/ne peut pas passer/);
    await expect(status(BRUNO, "paid")).rejects.toThrow(/introuvable/);
    await status(MAX, "paid");
    await expect(save(KARL, { id })).rejects.toThrow(/payée ou annulée/);
    await expect(one(KARL, "select public.delete_invoice($1, 'x')", [id])).rejects.toThrow(/payée ne se supprime pas/);
    await status(KARL, "issued");
    expect((await one<{ paid_at: string | null }>(KARL, "select paid_at from public.invoices where id = $1", [id])).paid_at).toBeNull();

    await expect(one(LINA, "select public.delete_invoice($1, 'x')", [id])).rejects.toThrow(/droit de la supprimer/);
    await expect(one(BRUNO, "select public.delete_invoice($1, 'x')", [id])).rejects.toThrow(/introuvable/);
    await one(MAX, "select public.delete_invoice($1, 'Facture {facture} supprimée.')", [id]);
    expect(await rows(KARL, "select id from public.invoice_items where invoice_id = $1", [id])).toEqual([]);
    const event = await one<{ text: string }>(KARL, "select text from public.activity_events where case_id = $1 order by at desc limit 1", [caseId]);
    expect(event.text).toBe(`Facture FAC-${YEAR}-00001 supprimée.`);
    // Le numéro d'une facture supprimée n'est jamais réutilisé.
    expect((await save(KARL)).number).toBe(`FAC-${YEAR}-00003`);
  });
});

describe("services", () => {
  let org: string;
  let karl: string;
  let clientId: string;
  let otherClientId: string;
  let caseId: string;
  let otherCaseId: string;

  beforeAll(async () => {
    org = (await one<{ id: string }>(KARL, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    karl = await memberId(KARL);
    clientId = (await createClient(KARL, org, karl, "Ngono")).id;
    otherClientId = (await createClient(KARL, org, karl, "Abega")).id;
    caseId = (await createCase(KARL, org, clientId, karl)).id;
    otherCaseId = (await createCase(KARL, org, otherClientId, karl)).id;
  });

  const saveService = (who: User, name: string, opts: { id?: string; price?: number | null; currency?: string | null; active?: boolean } = {}) =>
    one<{ id: string }>(who, "select public.save_service($1, $2, $3, 'Recherche et réservation du logement', $4, $5, $6) as id", [
      org, opts.id ?? null, name, opts.price === undefined ? 50000 : opts.price, opts.currency === undefined ? "XAF" : opts.currency, opts.active ?? true,
    ]).then((r) => r.id);

  const addClient = (who: User, serviceId: string, client = clientId, caseRef: string | null = caseId) =>
    one<{ id: string }>(who, "select public.add_service_client($1, $2, $3, 'in_progress', 'Arrivée prévue en septembre') as id", [serviceId, client, caseRef]).then((r) => r.id);

  const lastEvent = (client = clientId) =>
    one<{ text: string; case_id: string | null }>(KARL, "select text, case_id from public.activity_events where client_id = $1 order by at desc, id desc limit 1", [client]);

  it("réserve la liste des services aux responsables et refuse les doublons", async () => {
    await expect(saveService(LINA, "Hébergement")).rejects.toThrow(/propriétaire et les administrateurs/);
    await expect(saveService(BRUNO, "Hébergement")).rejects.toThrow(/propriétaire et les administrateurs/);
    const id = await saveService(KARL, "  Hébergement  ");
    expect(await one(NOAH, "select name, price_minor::int as price, currency, is_active from public.services where id = $1", [id])).toEqual({
      name: "Hébergement", price: 50000, currency: "XAF", is_active: true,
    });
    await expect(saveService(KARL, "hébergement")).rejects.toThrow(/s'appelle déjà « hébergement »/);
    await expect(saveService(KARL, "Garant", { currency: null })).rejects.toThrow(/Tarif invalide/);
    await expect(saveService(KARL, "Garant", { price: 0 })).rejects.toThrow(/Tarif invalide/);
    await expect(saveService(KARL, "G")).rejects.toThrow(/de 2 à 80 caractères/);
    expect(await saveService(KARL, "Garant", { price: null, currency: null })).toMatch(/^[0-9a-f-]{36}$/);
    expect(await rows(BRUNO, "select id from public.services")).toEqual([]);
    await expect(as(KARL, (tx) => tx.query("insert into public.services (organization_id, name) values ($1, 'AVI')", [org]))).rejects.toThrow(/permission denied/);
    await expect(saveService(BRUNO, "Hébergement en France", { id })).rejects.toThrow(/propriétaire et les administrateurs/);
    await saveService(KARL, "Hébergement en France", { id, price: 75000 });
    expect(await one(KARL, "select name, price_minor::int as price from public.services where id = $1", [id])).toEqual({ name: "Hébergement en France", price: 75000 });
  });

  it("ajoute un client à un service et note chaque changement dans son historique", async () => {
    const serviceId = await saveService(KARL, "AVI");
    await expect(addClient(NOAH, serviceId)).rejects.toThrow(/droit d'y ajouter/);
    await expect(addClient(MAX, serviceId)).rejects.toThrow(/droit d'y ajouter/);
    await expect(addClient(BRUNO, serviceId)).rejects.toThrow(/Service introuvable/);
    await expect(addClient(LINA, serviceId, clientId, otherCaseId)).rejects.toThrow(/n'appartient pas à ce client/);
    const linkId = await addClient(LINA, serviceId);
    expect(await lastEvent()).toEqual({ text: "Ajouté au service « AVI » (en cours).", case_id: caseId });
    await expect(addClient(KARL, serviceId)).rejects.toThrow(/Paul Ngono suit déjà le service « AVI »/);
    expect((await rows(NOAH, "select id from public.service_clients where service_id = $1", [serviceId])).length).toBe(1);
    expect(await rows(BRUNO, "select id from public.service_clients")).toEqual([]);

    const update = (who: User, status: string, caseRef: string | null = caseId) =>
      one(who, "select public.update_service_client($1, $2, $3, 'Attestation reçue')", [linkId, status, caseRef]);
    await expect(update(BRUNO, "completed")).rejects.toThrow(/Suivi introuvable/);
    await expect(update(LINA, "done")).rejects.toThrow(/État de suivi inconnu/);
    await expect(update(LINA, "completed", otherCaseId)).rejects.toThrow(/n'appartient pas à ce client/);
    await update(LINA, "completed");
    expect((await lastEvent()).text).toBe("Service « AVI » : terminé.");
    expect(await one(KARL, "select status, note from public.service_clients where id = $1", [linkId])).toEqual({ status: "completed", note: "Attestation reçue" });
    // Même état : la remarque change, l'historique n'est pas encombré.
    await update(LINA, "completed", null);
    expect((await lastEvent()).text).toBe("Service « AVI » : terminé.");

    await expect(one(NOAH, "select public.remove_service_client($1)", [linkId])).rejects.toThrow(/droit de le retirer/);
    await one(LINA, "select public.remove_service_client($1)", [linkId]);
    expect((await lastEvent()).text).toBe("Retiré du service « AVI ».");
    expect(await rows(KARL, "select id from public.service_clients where id = $1", [linkId])).toEqual([]);

    await saveService(KARL, "AVI", { id: serviceId, active: false });
    await expect(addClient(KARL, serviceId)).rejects.toThrow(/désactivé/);
  });

  it("supprime un service sans toucher aux fiches, dossiers et paiements des clients", async () => {
    const serviceId = await saveService(KARL, "Assurance voyage");
    await addClient(LINA, serviceId);
    await addClient(LINA, serviceId, otherClientId, null);
    await expect(one(LINA, "select public.delete_service($1)", [serviceId])).rejects.toThrow(/droit de le supprimer/);
    await expect(one(BRUNO, "select public.delete_service($1)", [serviceId])).rejects.toThrow(/introuvable/);
    expect((await one<{ n: number }>(KARL, "select public.delete_service($1) as n", [serviceId])).n).toBe(2);
    expect(await rows(KARL, "select id from public.services where id = $1", [serviceId])).toEqual([]);
    expect(await rows(KARL, "select id from public.service_clients where service_id = $1", [serviceId])).toEqual([]);
    expect((await rows(KARL, "select id from public.clients where id in ($1, $2)", [clientId, otherClientId])).length).toBe(2);
    expect((await rows(KARL, "select id from public.cases where id = $1", [caseId])).length).toBe(1);
    expect((await lastEvent(otherClientId)).text).toBe("Service « Assurance voyage » supprimé de la liste de l'agence : client retiré de ce service.");
  });

  it("donne à chaque service ses étapes et fait avancer chaque client suivi", async () => {
    const id = await saveService(KARL, "Logement à Lyon");
    const steps = await rows<{ label: string }>(NOAH, "select label from public.service_steps where service_id = $1 order by position", [id]);
    expect(steps.map((s) => s.label)).toEqual([
      "Demande reçue", "Documents attendus", "Documents reçus", "Paiement vérifié (si nécessaire)", "Dossier transmis au partenaire",
      "Réception confirmée", "Traitement en cours", "Résultat reçu", "Résultat transmis au client", "Service terminé",
    ]);
    const saveSteps = (who: User, labels: string[]) => one<{ n: number }>(who, "select public.save_service_steps($1, $2::text[]) as n", [id, labels]).then((r) => r.n);
    await expect(saveSteps(LINA, ["Demande reçue"])).rejects.toThrow(/propriétaire et les administrateurs/);
    await expect(saveSteps(KARL, ["  ", ""])).rejects.toThrow(/au moins une étape/);
    await expect(saveSteps(KARL, ["A"])).rejects.toThrow(/de 2 à 120 caractères/);
    expect(await saveSteps(KARL, ["Demande reçue", "  Logement   trouvé ", "", "Clés remises"])).toBe(3);

    const link = await addClient(LINA, id);
    const mine = await rows<{ id: string; label: string }>(KARL, "select id, label from public.service_client_steps where service_client_id = $1 order by position", [link]);
    expect(mine.map((s) => s.label)).toEqual(["Demande reçue", "Logement trouvé", "Clés remises"]);
    // Une nouvelle liste d'étapes ne touche pas les suivis déjà en cours.
    await saveSteps(KARL, ["Autre étape"]);
    expect((await rows(KARL, "select id from public.service_client_steps where service_client_id = $1", [link])).length).toBe(3);
    expect(await rows(BRUNO, "select id from public.service_client_steps")).toEqual([]);

    const tick = (who: User, step: string, done: boolean) => one<{ s: string }>(who, "select public.set_service_client_step($1, $2) as s", [step, done]).then((r) => r.s);
    await expect(tick(MAX, mine[0]!.id, true)).rejects.toThrow(/introuvable/);
    await expect(tick(BRUNO, mine[0]!.id, true)).rejects.toThrow(/introuvable/);
    expect(await tick(LINA, mine[0]!.id, true)).toBe("in_progress");
    expect((await lastEvent()).text).toBe("Service « Logement à Lyon » : étape « Demande reçue » faite.");
    await tick(LINA, mine[1]!.id, true);
    expect(await tick(LINA, mine[2]!.id, true)).toBe("completed");
    expect((await lastEvent()).text).toBe("Service « Logement à Lyon » : étape « Clés remises » faite (suivi terminé).");
    expect(await tick(KARL, mine[1]!.id, false)).toBe("in_progress");
    expect(await one(KARL, "select status from public.service_clients where id = $1", [link])).toEqual({ status: "in_progress" });
    expect((await lastEvent()).text).toBe("Service « Logement à Lyon » : étape « Logement trouvé » à refaire (suivi en cours).");
  });
});

describe("prospects", () => {
  let org: string;
  let karl: string;

  beforeAll(async () => {
    org = (await one<{ id: string }>(KARL, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    karl = await memberId(KARL);
  });

  const newProspect = (lastName: string) =>
    one<{ id: string; status: string; source: string }>(
      LINA,
      `insert into public.clients (organization_id, client_type, first_name, last_name, phone_e164, residence_country, city, assigned_to, status, source, source_detail)
       values ($1, 'student', 'Inès', $2, '+237690000777', 'CM', 'Yaoundé', $3, 'prospect', 'facebook', 'Publicité rentrée') returning id, status, source`,
      [org, lastName, karl],
    );
  const state = (id: string) => one<{ status: string; converted: boolean }>(KARL, "select status, converted_at is not null as converted from public.clients where id = $1", [id]);
  const lastEvent = (id: string) => one<{ text: string }>(KARL, "select text from public.activity_events where client_id = $1 order by at desc, id desc limit 1", [id]);

  it("transforme un prospect en client sur la même fiche, une seule fois", async () => {
    const prospect = await newProspect("Mballa");
    expect(prospect).toMatchObject({ status: "prospect", source: "facebook" });
    const convert = (who: User) => one(who, "select public.convert_prospect($1, 'Prospect devenu client.')", [prospect.id]);
    await expect(convert(BRUNO)).rejects.toThrow(/introuvable/);
    await expect(convert(NOAH)).rejects.toThrow(/introuvable/);
    await convert(LINA);
    expect(await state(prospect.id)).toEqual({ status: "client", converted: true });
    expect((await lastEvent(prospect.id)).text).toBe("Prospect devenu client.");
    await expect(convert(LINA)).rejects.toThrow(/déjà cliente/);
    await expect(as(KARL, (tx) => tx.query("update public.clients set status = 'prospect' where id = $1", [prospect.id]))).rejects.toThrow(/clients_converted_check/);
    await expect(as(KARL, (tx) => tx.query("update public.clients set source = 'radio' where id = $1", [prospect.id]))).rejects.toThrow(/clients_source_check/);
  });

  it("devient client dès son premier dossier ou son ajout à un service", async () => {
    const withCase = await newProspect("Essomba");
    const travelCase = await createCase(KARL, org, withCase.id, karl);
    expect(await state(withCase.id)).toEqual({ status: "client", converted: true });
    expect(await one(KARL, "select text, case_id from public.activity_events where client_id = $1 and text like 'Prospect%'", [withCase.id])).toEqual({
      text: "Prospect devenu client : premier dossier ouvert.", case_id: travelCase.id,
    });

    const withService = await newProspect("Fouda");
    const service = (await one<{ id: string }>(KARL, "select public.save_service($1, null, 'Logement étudiant', '', null, null, true) as id", [org])).id;
    await one(LINA, "select public.add_service_client($1, $2, null, 'in_progress', '') as id", [service, withService.id]);
    expect(await state(withService.id)).toEqual({ status: "client", converted: true });
    expect((await one<{ n: number }>(KARL, "select count(*)::int as n from public.activity_events where client_id = $1 and text like 'Prospect devenu client%'", [withService.id])).n).toBe(1);
    // Un client existant reste tel quel : aucune conversion ni événement en double.
    await createCase(KARL, org, withService.id, karl);
    expect((await one<{ n: number }>(KARL, "select count(*)::int as n from public.activity_events where client_id = $1 and text like 'Prospect devenu client%'", [withService.id])).n).toBe(1);
  });
});

describe("modèles d'étapes personnalisés", () => {
  let org: string;

  beforeAll(async () => {
    org = (await one<{ id: string }>(KARL, "select organization_id as id from public.members where user_id = auth.uid()")).id;
  });

  const steps = (extra: Record<string, unknown>[] = []) => [
    { key: "new_candidate", label: "Premier rendez-vous", kind: "agency_action" },
    ...extra,
    { key: "closed", label: "Dossier clôturé", kind: "closure" },
  ];
  const save = (who: User, value: unknown, key = "campus_france") => one(who, "select public.save_workflow_template($1, $2, $3::jsonb)", [org, key, JSON.stringify(value)]);

  it("garde la version de l'agence, la contrôle et peut revenir au modèle de départ", async () => {
    await expect(save(LINA, steps())).rejects.toThrow(/propriétaire et les administrateurs/);
    await expect(save(BRUNO, steps())).rejects.toThrow(/propriétaire et les administrateurs/);
    await expect(save(KARL, [{ key: "a", label: "Seule étape", kind: "agency_action" }])).rejects.toThrow(/de 2 à 60 étapes/);
    await expect(save(KARL, steps([{ key: "x", label: "Envoi", kind: "agency_action" }]).reverse())).rejects.toThrow(/clôture du dossier/);
    await expect(save(KARL, steps([{ key: "closed", label: "Doublon", kind: "agency_action" }]))).rejects.toThrow(/même clé/);
    await expect(save(KARL, steps([{ key: "x", label: "E", kind: "agency_action" }]))).rejects.toThrow(/de 2 à 120 caractères/);
    await expect(save(KARL, steps([{ key: "x", label: "Envoi", kind: "magie" }]))).rejects.toThrow(/type connu/);
    await expect(save(KARL, steps(), "Campus France")).rejects.toThrow(/Modèle inconnu/);

    await save(KARL, steps([{ key: "custom_1", label: "Traduction des diplômes", kind: "client_action", optional: true }]));
    await save(KARL, steps([{ key: "custom_1", label: "Traduction et légalisation", kind: "client_action" }]));
    const saved = await rows<{ template_key: string; n: number }>(NOAH, "select template_key, jsonb_array_length(steps) as n from public.workflow_templates");
    expect(saved).toEqual([{ template_key: "campus_france", n: 3 }]);
    expect(await rows(BRUNO, "select template_key from public.workflow_templates")).toEqual([]);
    await expect(as(KARL, (tx) => tx.query("delete from public.workflow_templates"))).rejects.toThrow(/permission denied/);

    await expect(one(LINA, "select public.reset_workflow_template($1, 'campus_france')", [org])).rejects.toThrow(/propriétaire et les administrateurs/);
    await one(KARL, "select public.reset_workflow_template($1, 'campus_france')", [org]);
    expect(await rows(KARL, "select template_key from public.workflow_templates")).toEqual([]);
  });
});

describe("partenaires et commissions", () => {
  let org: string;
  let karl: string;
  let partner: string;
  let clientId: string;

  beforeAll(async () => {
    org = (await one<{ id: string }>(KARL, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    karl = await memberId(KARL);
  });

  const savePartner = (who: User, name: string, code: string, id: string | null = null) =>
    one<{ id: string }>(who, "select public.save_partner($1, $2, $3, $4, '+237690001234', 'amina@exemple.test', 25000, 'XAF', '', true) as id", [org, id, name, code]).then((r) => r.id);
  const commission = () => one<{ id: string; status: string; amount: number }>(KARL, "select id, status, amount_minor::int as amount from public.partner_commissions where client_id = $1", [clientId]);

  it("rattache les clients apportés et suit leur commission jusqu'au versement", async () => {
    await expect(savePartner(LINA, "Amina Ngo", "AMINA26")).rejects.toThrow(/propriétaire et les administrateurs/);
    await expect(savePartner(KARL, "Amina Ngo", "a")).rejects.toThrow(/de 3 à 20 lettres/);
    partner = await savePartner(KARL, "  Amina   Ngo ", " amina-26 ");
    expect(await one(NOAH, "select name, code from public.partners where id = $1", [partner])).toEqual({ name: "Amina Ngo", code: "AMINA-26" });
    await expect(savePartner(KARL, "Autre", "AMINA-26")).rejects.toThrow(/déjà utilisé/);
    expect(await rows(BRUNO, "select id from public.partners")).toEqual([]);

    clientId = (await createClient(KARL, org, karl, "Bilong")).id;
    await expect(one(NOAH, "select public.set_client_partner($1, $2)", [clientId, partner])).rejects.toThrow(/introuvable/);
    await one(LINA, "select public.set_client_partner($1, $2)", [clientId, partner]);
    expect(await commission()).toMatchObject({ status: "pending", amount: 25000 });
    expect(await rows(NOAH, "select id from public.partner_commissions")).toEqual([]);
    const commissionId = (await commission()).id;
    await expect(one(MAX, "select public.pay_commission($1, now(), 'Orange Money', 'OM-1')", [commissionId])).rejects.toThrow(/« à payer »/);

    // Premier paiement confirmé : la commission devient « à payer ».
    const travelCase = await createCase(KARL, org, clientId, karl);
    const charge = (await one<{ id: string }>(KARL, "insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Accompagnement', 'agency_fee', 300000, 'XAF') returning id", [org, travelCase.id])).id;
    const pay = await one<{ r: { id: string } }>(KARL, "select public.record_payment($1, 100000, 'cash', 'Espèces', '', 'Paul', now(), $2::jsonb, 'Paiement (reçu {recu}).') as r", [travelCase.id, JSON.stringify([{ charge_id: charge, amount_minor: 100000 }])]);
    expect((await commission()).status).toBe("approved");

    await expect(one(LINA, "select public.update_commission($1, 30000)", [commissionId])).rejects.toThrow(/introuvable/);
    await one(MAX, "select public.update_commission($1, 30000)", [commissionId]);
    await one(MAX, "select public.pay_commission($1, now(), 'Orange Money', 'OM-1')", [commissionId]);
    expect(await commission()).toMatchObject({ status: "paid", amount: 30000 });
    await expect(one(KARL, "select public.set_client_partner($1, null)", [clientId])).rejects.toThrow(/déjà payée/);
    await expect(one(MAX, "select public.cancel_commission($1, 'Erreur')", [commissionId])).rejects.toThrow(/déjà payée ou annulée/);
    // Un paiement annulé ensuite ne revient pas sur une commission déjà versée.
    await one(KARL, "select public.void_payment($1, 'Erreur de saisie', 'Annulé.')", [pay.r.id]);
    expect((await commission()).status).toBe("paid");
  });

  it("ouvre au partenaire un espace limité à ses clients et ses commissions", async () => {
    const token = (await one<{ t: string }>(KARL, "select public.create_partner_access($1, 'oscar@partenaire.test') as t", [partner])).t;
    await expect(one(LINA, "select public.create_partner_access($1, 'oscar@partenaire.test')", [partner])).rejects.toThrow(/propriétaire et les administrateurs/);
    expect(await one(null, "select agency_name, partner_name, email from public.get_partner_access($1)", [token])).toMatchObject({ partner_name: "Amina Ngo", email: "oscar@partenaire.test" });
    await expect(one(BRUNO, "select public.accept_partner_access($1)", [token])).rejects.toThrow(/autre adresse/);
    await one(OSCAR, "select public.accept_partner_access($1)", [token]);
    await expect(one(OSCAR, "select public.accept_partner_access($1)", [token])).rejects.toThrow(/déjà utilisé/);

    expect((await one<{ p: boolean }>(OSCAR, "select public.is_partner() as p")).p).toBe(true);
    const portal = (await one<{ p: { partner_name: string; clients: { label: string; progress: string; commission_status: string; amount_minor: number }[] }[] }>(OSCAR, "select public.partner_portal() as p")).p;
    expect(portal).toHaveLength(1);
    expect(portal[0]!.partner_name).toBe("Amina Ngo");
    expect(portal[0]!.clients).toEqual([expect.objectContaining({ label: "Paul B.", progress: "Dossier en cours", commission_status: "paid", amount_minor: 30000 })]);
    // Ni téléphone, ni nom complet, ni paiements du client ; aucune table de l'agence lisible.
    expect(JSON.stringify(portal)).not.toMatch(/\+237|Bilong|100000/);
    for (const table of ["clients", "cases", "payments", "partners", "partner_commissions", "document_requirements"]) {
      expect(await rows(OSCAR, `select 1 from public.${table}`)).toEqual([]);
    }

    await one(KARL, "select public.revoke_partner_access($1)", [partner]);
    expect((await one<{ p: unknown[] }>(OSCAR, "select public.partner_portal() as p")).p).toEqual([]);
  });
});

describe("documents : solde des reçus et confirmations de réservation", () => {
  let org: string;
  let karl: string;

  beforeAll(async () => {
    org = (await one<{ id: string }>(KARL, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    karl = await memberId(KARL);
  });

  it("fige sur chaque reçu le reste à payer du dossier", async () => {
    const client = await createClient(KARL, org, karl, "Ekane");
    const travelCase = await createCase(KARL, org, client.id, karl);
    const charge = (await one<{ id: string }>(KARL, "insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Accompagnement', 'agency_fee', 300000, 'XAF') returning id", [org, travelCase.id])).id;
    const pay = (amount: number, pending = false) =>
      one<{ r: { id: string } }>(KARL, "select public.record_payment($1, $2, 'cash', 'Espèces', '', 'Paul', now(), $3::jsonb, 'Paiement.', $4) as r", [travelCase.id, amount, JSON.stringify([{ charge_id: charge, amount_minor: amount }]), pending]).then((x) => x.r.id);
    const balance = (id: string) => one<{ b: string | null }>(KARL, "select balance_after_minor::text as b from public.payments where id = $1", [id]).then((x) => x.b);

    const first = await pay(100000);
    expect(await balance(first)).toBe("200000");
    const announced = await pay(50000, true);
    expect(await balance(announced)).toBeNull();
    await one(KARL, "select public.confirm_payment($1, 'Vérifié (reçu {recu}).')", [announced]);
    expect(await balance(announced)).toBe("150000");
    const last = await pay(150000);
    expect(await balance(last)).toBe("0");
    // Le premier reçu garde son chiffre, même après les paiements suivants.
    expect(await balance(first)).toBe("200000");
  });

  it("numérote les confirmations de réservation et les réserve à l'agence", async () => {
    const client = await createClient(KARL, org, karl, "Mvogo");
    const service = (await one<{ id: string }>(KARL, "select public.save_service($1, null, 'Billet d''avion', '', null, null, true) as id", [org])).id;
    const link = (await one<{ id: string }>(LINA, "select public.add_service_client($1, $2, null, 'in_progress', '') as id", [service, client.id])).id;
    const save = (who: User, provider: string, reference: string, start: string | null = "2027-09-01", end: string | null = "2027-09-02", id: string | null = null) =>
      one<{ r: { id: string; number: string } }>(who, "select public.save_booking($1, $2, $3, $4, $5::date, $6::date, 'Aéroport de Douala', 'Vol direct, 23 kg de bagages', 450000, 'XAF') as r", [id, link, provider, reference, start, end]).then((x) => x.r);

    await expect(save(NOAH, "Air France", "ABC123")).rejects.toThrow(/introuvable/);
    await expect(save(BRUNO, "Air France", "ABC123")).rejects.toThrow(/introuvable/);
    await expect(save(LINA, " ", "")).rejects.toThrow(/prestataire ou la référence/);
    await expect(save(LINA, "Air France", "ABC123", "2027-09-02", "2027-09-01")).rejects.toThrow(/date de fin/);
    const booking = await save(LINA, "Air France", "ABC123");
    expect(booking.number).toBe(`CONF-${YEAR}-00001`);
    expect((await one<{ text: string }>(KARL, "select text from public.activity_events where client_id = $1 order by at desc, id desc limit 1", [client.id])).text).toBe(
      `Confirmation de réservation CONF-${YEAR}-00001 préparée (service « Billet d'avion »).`,
    );
    expect((await save(LINA, "Air France", "XYZ789", null, null, booking.id)).number).toBe(`CONF-${YEAR}-00001`);
    expect(await one(NOAH, "select reference, amount_minor::int as amount from public.service_bookings where id = $1", [booking.id])).toEqual({ reference: "XYZ789", amount: 450000 });
    expect(await rows(BRUNO, "select id from public.service_bookings")).toEqual([]);
    await expect(as(KARL, (tx) => tx.query("delete from public.service_bookings"))).rejects.toThrow(/permission denied/);
    await expect(one(NOAH, "select public.delete_booking($1)", [booking.id])).rejects.toThrow(/introuvable/);
    await one(LINA, "select public.delete_booking($1)", [booking.id]);
    expect(await rows(KARL, "select id from public.service_bookings")).toEqual([]);
  });
});

describe("e-mails transactionnels (Brevo) : file d'envoi, réglages, désinscription et livraison", () => {
  let org: string;
  let karl: string;

  const WORKER_SECRET = "worker-secret-0123456789abcdef-test";
  const WEBHOOK_SECRET = "webhook-secret-0123456789abcdef-test";

  // Crée un client avec e-mail, un dossier et un frais de 300 000 XAF ; renvoie de quoi encaisser.
  async function clientWithCharge(email: string, phone: string) {
    const client = await one<{ id: string }>(
      KARL,
      `insert into public.clients (organization_id, client_type, first_name, last_name, email, phone_e164, residence_country, city, assigned_to)
       values ($1, 'student', 'Awa', 'Nkolo', $2, $3, 'CM', 'Yaoundé', $4) returning id`,
      [org, email, phone, karl],
    );
    const travelCase = await createCase(KARL, org, client.id, karl);
    const charge = (
      await one<{ id: string }>(
        KARL,
        "insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Frais de dossier', 'agency_fee', 300000, 'XAF') returning id",
        [org, travelCase.id],
      )
    ).id;
    const pay = (amount: number) =>
      one<{ r: { id: string } }>(
        KARL,
        "select public.record_payment($1, $2, 'cash', 'Espèces', '', 'Awa', now(), $3::jsonb, 'Paiement (reçu {recu}).') as r",
        [travelCase.id, amount, JSON.stringify([{ charge_id: charge, amount_minor: amount }])],
      ).then((x) => x.r.id);
    return { clientId: client.id, caseId: travelCase.id, pay };
  }

  beforeAll(async () => {
    org = (await one<{ id: string }>(KARL, "select organization_id as id from public.members where user_id = auth.uid()")).id;
    karl = await memberId(KARL);
    // Seules les empreintes SHA-256 des secrets sont stockées.
    await db.query(
      `insert into private.system_secrets (key, secret_sha256) values
         ('email_worker', encode(sha256(convert_to($1, 'UTF8')), 'hex')),
         ('brevo_webhook', encode(sha256(convert_to($2, 'UTF8')), 'hex'))
       on conflict (key) do update set secret_sha256 = excluded.secret_sha256`,
      [WORKER_SECRET, WEBHOOK_SECRET],
    );
  });

  it("désactive tous les e-mails clients par défaut : un paiement confirmé n'inscrit rien", async () => {
    const settings = await one(KARL, "select * from public.email_settings where organization_id = $1", [org]);
    expect(settings).toMatchObject({
      notify_payment_confirmed: false,
      notify_appointment_reminder: false,
      notify_case_status: false,
      notify_missing_documents: false,
    });
    expect(settings).not.toHaveProperty("notify_subscription");

    const { pay } = await clientWithCharge("paul.defaut@client.test", "+237690001122");
    const paymentId = await pay(50000);
    expect(await rows(KARL, "select id from public.email_outbox where payment_id = $1", [paymentId])).toEqual([]);

    // Une agence qui enregistre ses réglages sans cocher une case la garde désactivée.
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ sender_name: "Agence K" })]);
    expect((await one<{ on: boolean }>(KARL, "select notify_payment_confirmed as on from public.email_settings where organization_id = $1", [org])).on).toBe(false);
  });

  it("enregistre les réglages d'e-mails par agence et contrôle les rôles", async () => {
    await expect(one(LINA, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ sender_name: "Agence K" })])).rejects.toThrow(
      /propriétaire et les administrateurs/,
    );
    await expect(
      one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ reply_to_email: "invalide" })]),
    ).rejects.toThrow(/adresse e-mail de réponse est invalide/);

    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [
      org,
      JSON.stringify({
        sender_name: "  Agence Karl Voyages  ",
        reply_to_email: "Contact@Agence-K.test",
        notify_payment_confirmed: true,
        notify_case_status: true,
      }),
    ]);

    const settings = await one(NOAH, "select sender_name, reply_to_email, notify_payment_confirmed, notify_case_status from public.email_settings where organization_id = $1", [org]);
    expect(settings).toEqual({
      sender_name: "Agence Karl Voyages",
      reply_to_email: "contact@agence-k.test",
      notify_payment_confirmed: true,
      notify_case_status: true,
    });
    expect(await rows(BRUNO, "select organization_id from public.email_settings where organization_id = $1", [org])).toEqual([]);
  });

  it("n'inscrit un e-mail de paiement qu'à la confirmation, sans doublon, et suit la livraison Brevo", async () => {
    const client = await one<{ id: string; email_unsubscribe_token: string }>(
      KARL,
      `insert into public.clients (organization_id, client_type, first_name, last_name, email, phone_e164, residence_country, city, assigned_to)
       values ($1, 'student', 'Inès', 'Tchoumi', 'ines@client.test', '+237690009988', 'CM', 'Douala', $2)
       returning id, email_unsubscribe_token::text`,
      [org, karl],
    );
    const travelCase = await createCase(KARL, org, client.id, karl);
    const charge = (
      await one<{ id: string }>(
        KARL,
        "insert into public.charges (organization_id, case_id, label, charge_type, amount_minor, currency) values ($1, $2, 'Frais de dossier', 'agency_fee', 250000, 'XAF') returning id",
        [org, travelCase.id],
      )
    ).id;

    // 1. Paiement annoncé (« pending ») : aucun e-mail dans la file d'envoi.
    const pendingPay = (
      await one<{ r: { id: string } }>(
        KARL,
        "select public.record_payment($1, 100000, 'mobile_money', 'Orange Money', 'OM-99', 'Inès', now(), $2::jsonb, 'Annoncé.', true) as r",
        [travelCase.id, JSON.stringify([{ charge_id: charge, amount_minor: 100000 }])],
      )
    ).r.id;
    expect(await rows(KARL, "select id from public.email_outbox where payment_id = $1", [pendingPay])).toEqual([]);

    // 2. Confirmation du paiement : un e-mail payment_confirmed est inscrit dans la file et noté « queued » dans les communications.
    await one(KARL, "select public.confirm_payment($1, 'Confirmé (reçu {recu}).')", [pendingPay]);
    const queued = await rows<{ id: string; kind: string; status: string; recipient_email: string; payload: { balance_after_minor: number } }>(
      KARL,
      "select id, kind, status, recipient_email, payload from public.email_outbox where payment_id = $1",
      [pendingPay],
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      kind: "payment_confirmed",
      status: "queued",
      recipient_email: "ines@client.test",
    });
    expect(queued[0]!.payload.balance_after_minor).toBe(150000);

    const commBefore = await one<{ status: string; channel: string }>(
      KARL,
      "select status, channel from public.communication_logs where email_outbox_id = $1",
      [queued[0]!.id],
    );
    expect(commBefore).toEqual({ status: "queued", channel: "email" });

    // 3. Réclamation et envoi par l'agence : « sent » après acceptation Brevo, puis « delivered » uniquement via le webhook.
    await expect(rows(BRUNO, "select * from public.claim_agency_emails($1, 5)", [org])).rejects.toThrow(/Accès refusé/);
    const claimed = await rows<{ id: string; status: string; attempts: number }>(KARL, "select id, status, attempts from public.claim_agency_emails($1, 5)", [org]);
    const target = claimed.find((c) => c.id === queued[0]!.id)!;
    expect(target).toMatchObject({ status: "sending", attempts: 1 });

    await one(KARL, "select public.complete_agency_email($1, true, '<brevo-msg-001@smtp-relay.mailin.fr>', null)", [target.id]);
    expect(await one(KARL, "select status, brevo_message_id from public.email_outbox where id = $1", [target.id])).toEqual({
      status: "sent",
      brevo_message_id: "<brevo-msg-001@smtp-relay.mailin.fr>",
    });
    expect((await one<{ status: string }>(KARL, "select status from public.communication_logs where email_outbox_id = $1", [target.id])).status).toBe("sent");

    // 4. Webhook Brevo : secret invalide refusé, secret valide marque « delivered ».
    await expect(one(null, "select public.apply_brevo_webhook('mauvais-secret', '<brevo-msg-001@smtp-relay.mailin.fr>', 'delivered', null)")).rejects.toThrow(
      /Secret webhook invalide/,
    );
    const applied = await one<{ ok: boolean }>(
      null,
      "select public.apply_brevo_webhook($1, '<brevo-msg-001@smtp-relay.mailin.fr>', 'delivered', null) as ok",
      [WEBHOOK_SECRET],
    );
    expect(applied.ok).toBe(true);
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where id = $1", [target.id])).status).toBe("delivered");
    expect((await one<{ status: string }>(KARL, "select status from public.communication_logs where email_outbox_id = $1", [target.id])).status).toBe("delivered");

    // 5. Désinscription du client : bloque les relances mais laisse passer l'envoi d'un document demandé.
    const unsub = await one<{ r: { first_name: string; unsubscribed: boolean } }>(
      null,
      "select public.unsubscribe_client_email($1::uuid) as r",
      [client.email_unsubscribe_token],
    );
    expect(unsub.r).toMatchObject({ first_name: "Inès", unsubscribed: true });

    await expect(
      one(LINA, "select public.queue_missing_documents_email($1, gen_random_uuid())", [travelCase.id]),
    ).rejects.toThrow(/désinscrit/);

    const docOutbox = await one<{ id: string }>(
      LINA,
      "select public.queue_agency_email($1, 'document_send', 'doc:1', $2, $3, null, 'Votre récapitulatif', '{}'::jsonb, 'Récapitulatif (PDF)') as id",
      [org, client.id, travelCase.id],
    );
    expect(docOutbox.id).toBeTruthy();
    // Même clé d'idempotence : aucun doublon créé.
    const dupOutbox = await one<{ id: string | null }>(
      LINA,
      "select public.queue_agency_email($1, 'document_send', 'doc:1', $2, $3, null, 'Votre récapitulatif', '{}'::jsonb, 'Récapitulatif (PDF)') as id",
      [org, client.id, travelCase.id],
    );
    expect(dupOutbox.id).toBeNull();
  });

  it("refuse la file d'envoi aux rôles sans dossiers et toute confirmation de paiement manuelle", async () => {
    await expect(rows(NOAH, "select * from public.claim_agency_emails($1, 5)", [org])).rejects.toThrow(/Accès refusé/);
    const ines = await one<{ id: string }>(KARL, "select id from public.clients where email = 'ines@client.test'");
    await expect(
      one(LINA, "select public.queue_agency_email($1, 'payment_confirmed', 'faux:1', $2, null, null, 'Reçu', '{}'::jsonb, null)", [org, ines.id]),
    ).rejects.toThrow(/non autorisé/);
    // Relances et avancement : uniquement par leurs fonctions, qui tirent le contenu de la base.
    for (const kind of ["missing_documents", "case_status_changed"]) {
      await expect(
        one(LINA, "select public.queue_agency_email($1, $2, 'faux:2', $3, null, null, 'Visa accordé', '{}'::jsonb, null)", [org, kind, ines.id]),
      ).rejects.toThrow(/non autorisé/);
    }
    // Un dossier d'un autre client ne peut pas être joint.
    const other = await clientWithCharge("autre.client@client.test", "+237690003344");
    await expect(
      one(LINA, "select public.queue_agency_email($1, 'document_send', 'doc:x', $2, $3, null, 'Doc', '{}'::jsonb, null)", [org, ines.id, other.caseId]),
    ).rejects.toThrow(/n'appartient pas à ce client/);
    // Un envoi demandé par un membre est marqué comme non automatique.
    const doc = await one<{ is_automatic: boolean }>(KARL, "select is_automatic from public.email_outbox where idempotency_key = 'doc:1'");
    expect(doc.is_automatic).toBe(false);
  });

  it("revérifie juste avant l'envoi : paiement annulé ou notification désactivée = e-mail annulé, jamais envoyé", async () => {
    const { pay } = await clientWithCharge("awa@client.test", "+237690005566");
    const p1 = await pay(100000);
    const p2 = await pay(100000);
    const queued = await rows<{ payment_id: string; status: string }>(
      KARL,
      "select payment_id, status from public.email_outbox where payment_id = any($1::uuid[]) order by created_at",
      [[p1, p2]],
    );
    expect(queued.map((q) => q.status)).toEqual(["queued", "queued"]);

    // Paiement annulé entre l'inscription et l'envoi : l'e-mail est annulé, l'autre part.
    await one(KARL, "select public.void_payment($1, 'Erreur de saisie', 'Annulé.')", [p1]);
    const claimed = await rows<{ id: string; payment_id: string | null }>(KARL, "select id, payment_id from public.claim_agency_emails($1, 25)", [org]);
    expect(claimed.some((c) => c.payment_id === p1)).toBe(false);
    const sendingP2 = claimed.find((c) => c.payment_id === p2)!;
    expect(sendingP2).toBeTruthy();
    const cancelled = await one<{ status: string; last_error: string }>(KARL, "select status, last_error from public.email_outbox where payment_id = $1", [p1]);
    expect(cancelled).toEqual({ status: "cancelled", last_error: "Annulé : le paiement n'est plus confirmé." });
    expect(
      (await one<{ status: string }>(KARL, "select cl.status from public.communication_logs cl join public.email_outbox e on e.id = cl.email_outbox_id where e.payment_id = $1", [p1])).status,
    ).toBe("cancelled");

    // Erreur définitive (adresse refusée) : échec immédiat, pas de nouvelle tentative.
    await one(KARL, "select public.complete_agency_email($1, false, null, 'Brevo (400) : adresse invalide', true)", [sendingP2.id]);
    expect(await one(KARL, "select status, attempts from public.email_outbox where id = $1", [sendingP2.id])).toEqual({ status: "failed", attempts: 1 });
    // Une seconde clôture du même envoi est sans effet.
    await one(KARL, "select public.complete_agency_email($1, true, '<double@brevo>', null)", [sendingP2.id]);
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where id = $1", [sendingP2.id])).status).toBe("failed");

    // Notification désactivée par l'agence après l'inscription : annulée avant l'envoi.
    const p3 = await pay(50000);
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where payment_id = $1", [p3])).status).toBe("queued");
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_payment_confirmed: false })]);
    await rows(KARL, "select id from public.claim_agency_emails($1, 25)", [org]);
    expect(await one(KARL, "select status, last_error from public.email_outbox where payment_id = $1", [p3])).toEqual({
      status: "cancelled",
      last_error: "Annulé : cette notification est désactivée par l'agence.",
    });
  });

  it("planificateur et webhook : secrets vérifiés par empreinte, statuts de livraison fiables", async () => {
    // Le secret n'est jamais stocké en clair.
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'private' and table_name = 'system_secrets'",
    );
    expect(cols.rows.map((c) => c.column_name).sort()).toEqual(["key", "secret_sha256", "updated_at"]);

    await expect(one(null, "select * from public.claim_system_emails('mauvais-secret-mauvais-secret-0000', 5)")).rejects.toThrow(/Secret système invalide/);
    await expect(one(null, "select * from public.claim_system_emails($1, 5)", [WORKER_SECRET.slice(0, 20)])).rejects.toThrow(/Secret système invalide/);

    // Un e-mail demandé par l'agence (sans PDF : relance des pièces), envoyé par le planificateur.
    const ines = await one<{ id: string }>(KARL, "select id from public.clients where email = 'ines@client.test'");
    await db.query("update public.clients set email_opt_out = false, email_opt_out_at = null where id = $1", [ines.id]);
    const inesCase = await one<{ id: string }>(KARL, "select id from public.cases where client_id = $1 and status = 'active' limit 1", [ines.id]);
    const queuedId = (await one<{ id: string }>(LINA, "select public.queue_missing_documents_email($1, gen_random_uuid()) as id", [inesCase.id])).id;
    const claimed = await rows<{ id: string }>(null, "select id from public.claim_system_emails($1, 50)", [WORKER_SECRET]);
    expect(claimed.some((c) => c.id === queuedId)).toBe(true);
    await one(null, "select public.complete_system_email($1, $2, true, '<msg-webhook@brevo>', null)", [WORKER_SECRET, queuedId]);
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where id = $1", [queuedId])).status).toBe("sent");

    const hook = (event: string, reason: string | null = null) =>
      one(null, "select public.apply_brevo_webhook($1, '<msg-webhook@brevo>', $2, $3)", [WEBHOOK_SECRET, event, reason]);

    // Report temporaire : le statut ne change pas.
    await hook("soft_bounce", "Boîte pleine");
    expect(await one(KARL, "select status, last_event, last_error from public.email_outbox where id = $1", [queuedId])).toEqual({
      status: "sent",
      last_event: "soft_bounce",
      last_error: "Boîte pleine",
    });
    // Signalé comme indésirable : le client est désinscrit, et l'e-mail ne repasse jamais « livré ».
    await hook("spam");
    await hook("delivered");
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where id = $1", [queuedId])).status).toBe("complained");
    expect((await one<{ email_opt_out: boolean }>(KARL, "select email_opt_out from public.clients where id = $1", [ines.id])).email_opt_out).toBe(true);

    // Événement arrivé avant l'enregistrement de l'identifiant Brevo : retrouvé par l'étiquette « outbox-<id> ».
    const early = await clientWithCharge("livraison.rapide@client.test", "+237690004401");
    const earlyId = (await one<{ id: string }>(LINA, "select public.queue_missing_documents_email($1, gen_random_uuid()) as id", [early.caseId])).id;
    await rows(null, "select id from public.claim_system_emails($1, 50)", [WORKER_SECRET]);
    const tagged = (event: string, messageId: string | null, outboxId: string, reason: string | null = null) =>
      one<{ ok: boolean }>(null, "select public.apply_brevo_webhook($1, $2, $3, $4, $5) as ok", [WEBHOOK_SECRET, messageId, event, reason, outboxId]).then((r) => r.ok);
    expect(await tagged("delivered", "<msg-rapide@brevo>", earlyId)).toBe(true);
    expect(await one(KARL, "select status, brevo_message_id, last_event, last_error from public.email_outbox where id = $1", [earlyId])).toEqual({
      status: "delivered",
      brevo_message_id: "<msg-rapide@brevo>",
      last_event: "delivered",
      last_error: null,
    });
    // La clôture qui arrive ensuite ne change rien ; un report temporaire n'écrit plus d'erreur sur un e-mail livré.
    await one(null, "select public.complete_system_email($1, $2, true, '<msg-rapide@brevo>', null)", [WORKER_SECRET, earlyId]);
    expect(await tagged("soft_bounce", "<msg-rapide@brevo>", earlyId, "Boîte pleine")).toBe(true);
    expect(await one(KARL, "select status, last_error from public.email_outbox where id = $1", [earlyId])).toEqual({ status: "delivered", last_error: null });
    expect((await one<{ status: string }>(KARL, "select status from public.communication_logs where email_outbox_id = $1", [earlyId])).status).toBe("delivered");
    // Une étiquette ne permet jamais de remplacer un identifiant Brevo différent.
    expect(await tagged("hard_bounce", "<autre-message@brevo>", earlyId)).toBe(false);
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where id = $1", [earlyId])).status).toBe("delivered");
    // Mauvais secret : refus.
    await expect(one(null, "select public.apply_brevo_webhook('mauvais-secret-mauvais-secret-0000', '<x>', 'delivered', null, null)")).rejects.toThrow(/Secret webhook invalide/);
  });

  // Fait avancer un dossier jusqu'à l'étape `key`, comme l'écran du dossier (verrou de version compris).
  async function moveTo(caseId: string, key: string, casePatch: Record<string, unknown> = {}) {
    const { version } = await one<{ version: number }>(KARL, "select version from public.cases where id = $1", [caseId]);
    const steps = await rows<{ id: string; key: string; kind: string; status: string }>(KARL, "select id, key, kind, status from public.case_steps where case_id = $1", [caseId]);
    const patch = steps
      .filter((s) => s.status === "in_progress" || s.key === key)
      .map((s) => ({ id: s.id, status: s.key === key ? (s.kind === "closure" ? "done" : "in_progress") : "done" }));
    return one<{ v: number }>(KARL, "select public.apply_case_transition($1, $2, $3::jsonb, $4::jsonb, 'Étape') as v", [
      caseId,
      version,
      JSON.stringify(patch),
      JSON.stringify({ next_action: key, ...casePatch }),
    ]).then((r) => r.v);
  }
  const caseEmails = (caseId: string) =>
    rows<{ id: string; status: string; is_automatic: boolean; subject: string; payload: Record<string, unknown>; last_error: string | null }>(
      KARL,
      "select id, status, is_automatic, subject, payload, last_error from public.email_outbox where case_id = $1 and kind = 'case_status_changed' order by created_at, id",
      [caseId],
    );

  it("avancement du dossier : seulement si l'agence l'a activé, et seulement quand le client est concerné", async () => {
    const { clientId, caseId } = await clientWithCharge("suivi@client.test", "+237690007788");
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_case_status: false })]);
    // Désactivé : même une action attendue du client n'envoie rien.
    await moveTo(caseId, "documents");
    expect(await caseEmails(caseId)).toEqual([]);

    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_case_status: true })]);
    // Étape de travail de l'agence : rien.
    await moveTo(caseId, "application_prep");
    expect(await caseEmails(caseId)).toEqual([]);

    // Action attendue du client (ici, retour à la collecte des documents) : un e-mail, contenu tiré de la base.
    const v = await moveTo(caseId, "documents");
    const [docs] = await caseEmails(caseId);
    expect(docs).toMatchObject({ status: "queued", is_automatic: true });
    expect(docs!.subject).toMatch(/^Action attendue pour votre dossier /);
    expect(docs!.payload).toMatchObject({ event: "client_action", step_label: "Collecte des documents", case_version: v, client_first_name: "Awa" });
    const log = await one<{ status: string; summary: string }>(KARL, "select status, summary from public.communication_logs where email_outbox_id = $1", [docs!.id]);
    expect(log).toEqual({ status: "queued", summary: "Avancement du dossier envoyé par e-mail : Collecte des documents" });

    // Le dossier a encore changé avant l'envoi (attente d'un organisme : rien à dire) : l'information dépassée est annulée.
    await moveTo(caseId, "study_procedure");
    expect(await caseEmails(caseId)).toHaveLength(1);
    await rows(KARL, "select id from public.claim_agency_emails($1, 50)", [org]);
    expect((await caseEmails(caseId))[0]).toMatchObject({
      status: "cancelled",
      last_error: "Annulé : le dossier a encore changé depuis (nouvelle étape ou retour en arrière).",
    });

    // Décision enregistrée : un e-mail, toujours d'actualité au moment de l'envoi.
    await moveTo(caseId, "visa_refused", { outcome: "refused" });
    const decision = (await caseEmails(caseId))[1]!;
    expect(decision.payload).toMatchObject({ event: "decision", status_label: "Visa refusé", outcome: "refused" });
    expect(decision.subject).toMatch(/^Mise à jour de votre dossier /);
    const claimed = await rows<{ id: string }>(KARL, "select id from public.claim_agency_emails($1, 50)", [org]);
    expect(claimed.map((c) => c.id)).toContain(decision.id);

    // Clôture : un dernier e-mail.
    await moveTo(caseId, "closed", { status: "closed", closed_at: new Date().toISOString() });
    expect((await caseEmails(caseId))[2]!.payload).toMatchObject({ event: "closure", status_label: "Dossier clôturé" });
    expect(await caseEmails(caseId)).toHaveLength(3);

    // Client désinscrit, ou sans adresse : rien.
    const optedOut = await clientWithCharge("plus.de.mails@client.test", "+237690007799");
    await db.query("update public.clients set email_opt_out = true where id = $1", [optedOut.clientId]);
    await moveTo(optedOut.caseId, "documents");
    expect(await caseEmails(optedOut.caseId)).toEqual([]);
    const noEmail = await clientWithCharge("sans.adresse@client.test", "+237690007711");
    await db.query("update public.clients set email = null where id = $1", [noEmail.clientId]);
    await moveTo(noEmail.caseId, "documents");
    expect(await caseEmails(noEmail.caseId)).toEqual([]);
    expect(clientId).toBeTruthy();
  });

  it("relance des pièces manquantes : liste tirée de la base, droits, désinscription et dossier clôturé", async () => {
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_missing_documents: false })]);
    const { caseId } = await clientWithCharge("pieces@client.test", "+237690009900");
    const reqs = await rows<{ id: string; label: string }>(KARL, "select id, label from public.document_requirements where case_id = $1 and is_required order by created_at, id", [caseId]);
    expect(reqs.length).toBeGreaterThanOrEqual(3);
    const [toCorrect, validated, optional] = reqs;
    await db.query("update public.document_requirements set status = 'to_correct', review_comment = 'Photo illisible' where id = $1", [toCorrect!.id]);
    await db.query("update public.document_requirements set status = 'validated' where id = $1", [validated!.id]);
    await db.query("update public.document_requirements set is_required = false where id = $1", [optional!.id]);
    const expected = reqs.length - 2;

    const id = (await one<{ id: string }>(LINA, "select public.queue_missing_documents_email($1, '11111111-1111-4111-8111-111111111111') as id", [caseId])).id;
    const sent = await one<{ kind: string; is_automatic: boolean; subject: string; payload: { missing_documents: { label: string; status: string; comment: string }[] } }>(
      KARL,
      "select kind, is_automatic, subject, payload from public.email_outbox where id = $1",
      [id],
    );
    expect(sent).toMatchObject({ kind: "missing_documents", is_automatic: false });
    expect(sent.subject).toMatch(/^Pièces attendues pour votre dossier /);
    const docs = sent.payload.missing_documents;
    expect(docs).toHaveLength(expected);
    expect(docs[0]).toEqual({ label: toCorrect!.label, status: "to_correct", comment: "Photo illisible" });
    expect(docs.map((d) => d.label)).not.toContain(validated!.label);
    expect(docs.map((d) => d.label)).not.toContain(optional!.label);
    const log = await one<{ summary: string }>(KARL, "select summary from public.communication_logs where email_outbox_id = $1", [id]);
    expect(log.summary).toBe(`Relance des pièces manquantes par e-mail (${expected} pièce${expected > 1 ? "s" : ""})`);

    // Même demande : pas de doublon. Rôles sans dossiers : refusé.
    expect((await one<{ id: string | null }>(LINA, "select public.queue_missing_documents_email($1, '11111111-1111-4111-8111-111111111111') as id", [caseId])).id).toBeNull();
    for (const who of [MAX, NOAH]) {
      await expect(one(who, "select public.queue_missing_documents_email($1, gen_random_uuid())", [caseId])).rejects.toThrow(/pas le droit/);
    }

    // Demandée par un membre : part même si la relance automatique est désactivée.
    const claimed = await rows<{ id: string }>(KARL, "select id from public.claim_agency_emails($1, 50)", [org]);
    expect(claimed.map((c) => c.id)).toContain(id);

    // Plus aucune pièce manquante : refusé.
    const second = (await one<{ id: string }>(LINA, "select public.queue_missing_documents_email($1, gen_random_uuid()) as id", [caseId])).id;
    await db.query("update public.document_requirements set status = 'validated' where case_id = $1 and is_required", [caseId]);
    await expect(one(LINA, "select public.queue_missing_documents_email($1, gen_random_uuid())", [caseId])).rejects.toThrow(/Aucune pièce obligatoire/);

    // Dossier clôturé : refusé, et la relance encore en file est annulée.
    await db.query("update public.cases set status = 'closed', closed_at = now() where id = $1", [caseId]);
    await expect(one(LINA, "select public.queue_missing_documents_email($1, gen_random_uuid())", [caseId])).rejects.toThrow(/n'est plus en cours/);
    await rows(KARL, "select id from public.claim_agency_emails($1, 50)", [org]);
    expect(await one(KARL, "select status, last_error from public.email_outbox where id = $1", [second])).toEqual({
      status: "cancelled",
      last_error: "Annulé : le dossier n'est plus en cours.",
    });
  });

  const schedule = () => one<{ r: { reminders: number; relances: number; notices: number } }>(null, "select public.schedule_system_emails($1) as r", [WORKER_SECRET]).then((x) => x.r);
  // Demain à l'heure donnée, dans le fuseau de l'agence (Africa/Douala).
  const tomorrowAt = (time: string, days = 1) => `((now() at time zone 'Africa/Douala')::date + ${days} + time '${time}') at time zone 'Africa/Douala'`;
  async function appointment(clientId: string, caseId: string | null, opts: { kind?: string; status?: string; when?: string; title?: string } = {}) {
    return (
      await one<{ id: string }>(
        KARL,
        `insert into public.appointments (organization_id, client_id, case_id, kind, title, starts_at, location, assigned_to, status)
         values ($1, $2, $3, $4, $5, ${opts.when ?? tomorrowAt("10:00")}, 'Agence de Douala', $6, $7) returning id`,
        [org, clientId, caseId, opts.kind ?? "consultation", opts.title ?? "Point sur le dossier", karl, opts.status ?? "planned"],
      )
    ).id;
  }
  const reminderOf = (appointmentId: string) =>
    rows<{ id: string; status: string; last_error: string | null; payload: Record<string, unknown> }>(
      KARL,
      "select id, status, last_error, payload from public.email_outbox where appointment_id = $1 and kind = 'appointment_reminder' order by created_at, id",
      [appointmentId],
    );

  it("tâche planifiée : secret exigé, rappel la veille seulement pour les vrais rendez-vous, revérifié avant l'envoi", async () => {
    await expect(one(null, "select public.schedule_system_emails('mauvais-secret-mauvais-secret-0000')")).rejects.toThrow(/Secret système invalide/);
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_appointment_reminder: false })]);
    const { clientId, caseId } = await clientWithCharge("rdv@client.test", "+237690006601");
    const rdv = await appointment(clientId, caseId);
    const deadline = await appointment(clientId, caseId, { kind: "document_deadline", title: "Date limite des pièces" });
    const later = await appointment(clientId, caseId, { when: tomorrowAt("10:00", 2) });
    const cancelled = await appointment(clientId, caseId, { status: "cancelled" });
    const optedOut = await clientWithCharge("rdv.desinscrit@client.test", "+237690006602");
    await db.query("update public.clients set email_opt_out = true where id = $1", [optedOut.clientId]);
    const rdvOptedOut = await appointment(optedOut.clientId, optedOut.caseId);

    // Réglage désactivé : aucun rappel.
    await schedule();
    expect(await reminderOf(rdv)).toEqual([]);

    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_appointment_reminder: true })]);
    await schedule();
    await schedule();
    const [reminder] = await reminderOf(rdv);
    expect(await reminderOf(rdv)).toHaveLength(1);
    expect(reminder!.payload).toMatchObject({ appointment_title: "Point sur le dossier", all_day: false, location: "Agence de Douala", client_first_name: "Awa" });
    expect(new Date(String(reminder!.payload.starts_at)).getTime()).toBeGreaterThan(Date.now());
    for (const other of [deadline, later, cancelled, rdvOptedOut]) expect(await reminderOf(other)).toEqual([]);
    const log = await one<{ actor_id: string | null; summary: string }>(KARL, "select actor_id, summary from public.communication_logs where email_outbox_id = $1", [reminder!.id]);
    expect(log).toEqual({ actor_id: null, summary: "Rappel de rendez-vous envoyé par e-mail : Point sur le dossier" });

    // Rendez-vous déplacé avant l'envoi : l'ancien rappel est annulé, un nouveau est préparé pour la nouvelle heure.
    await one(KARL, `update public.appointments set starts_at = ${tomorrowAt("15:00")} where id = $1 returning id`, [rdv]);
    const claimed = await rows<{ id: string; kind: string }>(null, "select id, kind from public.claim_system_emails($1, 50)", [WORKER_SECRET]);
    expect(claimed.map((c) => c.id)).not.toContain(reminder!.id);
    expect((await reminderOf(rdv))[0]).toMatchObject({ status: "cancelled", last_error: "Annulé : le rendez-vous a été déplacé, annulé ou est déjà passé." });
    await schedule();
    const moved = (await reminderOf(rdv))[1]!;
    expect(moved.status).toBe("queued");
    expect((await rows<{ id: string }>(null, "select id from public.claim_system_emails($1, 50)", [WORKER_SECRET])).map((c) => c.id)).toContain(moved.id);

    // La tâche planifiée ne prend jamais un e-mail qui doit joindre un PDF : il part depuis l'agence.
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_payment_confirmed: true })]);
    const pay = await clientWithCharge("recu.planifie@client.test", "+237690006603");
    const paymentId = await pay.pay(10000);
    const paymentMail = await one<{ id: string }>(KARL, "select id from public.email_outbox where payment_id = $1", [paymentId]);
    expect((await rows<{ id: string }>(null, "select id from public.claim_system_emails($1, 50)", [WORKER_SECRET])).map((c) => c.id)).not.toContain(paymentMail.id);
    expect((await one<{ status: string }>(KARL, "select status from public.email_outbox where id = $1", [paymentMail.id])).status).toBe("queued");
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_payment_confirmed: false, notify_appointment_reminder: true })]);
  });

  it("relance automatique des pièces : dossier qui attend le client, sans nouvelle depuis 3 jours, une fois par semaine, 3 fois au plus", async () => {
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_missing_documents: true })]);
    const waiting = await clientWithCharge("relance.auto@client.test", "+237690006604");
    await moveTo(waiting.caseId, "documents");
    const internal = await clientWithCharge("relance.interne@client.test", "+237690006605");
    const age = (caseId: string, days: number) =>
      db.exec(`alter table public.cases disable trigger cases_touch;
               update public.cases set updated_at = now() - interval '${days} days' where id = '${caseId}';
               alter table public.cases enable trigger cases_touch;`);
    const relances = (caseId: string) =>
      rows<{ id: string; is_automatic: boolean; payload: { missing_documents: unknown[] } }>(
        KARL,
        "select id, is_automatic, payload from public.email_outbox where case_id = $1 and kind = 'missing_documents' and status <> 'cancelled' order by created_at, id",
        [caseId],
      );

    // Dossier modifié récemment : on laisse le temps au client.
    await schedule();
    expect(await relances(waiting.caseId)).toEqual([]);

    await age(waiting.caseId, 4);
    await age(internal.caseId, 4); // en attente d'une action de l'agence : jamais relancé
    await schedule();
    const [first] = await relances(waiting.caseId);
    expect(first).toMatchObject({ is_automatic: true });
    expect(first!.payload.missing_documents.length).toBeGreaterThan(0);
    expect(await relances(internal.caseId)).toEqual([]);
    expect((await one<{ summary: string }>(KARL, "select summary from public.communication_logs where email_outbox_id = $1", [first!.id])).summary).toMatch(/^Relance automatique des pièces manquantes \(\d+ pièces?\)$/);

    // Au plus une relance par semaine…
    await schedule();
    expect(await relances(waiting.caseId)).toHaveLength(1);
    // … et 3 relances automatiques au plus (chaque relance est vieillie d'une semaine).
    const olderThanAWeek = () =>
      db.query(
        "update public.email_outbox set created_at = created_at - interval '8 days', idempotency_key = idempotency_key || ':' || gen_random_uuid() where case_id = $1 and kind = 'missing_documents'",
        [waiting.caseId],
      );
    for (let i = 0; i < 3; i++) {
      await olderThanAWeek();
      await schedule();
    }
    expect(await relances(waiting.caseId)).toHaveLength(3);

    // Réglage désactivé : plus rien.
    await one(KARL, "select public.save_email_settings($1, $2::jsonb)", [org, JSON.stringify({ notify_missing_documents: false, notify_appointment_reminder: true })]);
    const quiet = await clientWithCharge("relance.off@client.test", "+237690006606");
    await moveTo(quiet.caseId, "documents");
    await age(quiet.caseId, 4);
    await schedule();
    expect(await relances(quiet.caseId)).toEqual([]);
  });

  it("messages de la plateforme restés en attente plus de 3 jours : annulés au lieu de partir en retard", async () => {
    const platformMail = (key: string, kind: string, age: string) =>
      db
        .query<{ id: string }>(
          `insert into public.email_outbox (organization_id, kind, idempotency_key, recipient_email, recipient_name, subject, payload, created_at)
           values ($1, $2, $3, $4, 'Karl Biya', 'Message', '{}'::jsonb, now() - $5::interval) returning id`,
          [org, kind, key, KARL.email, age],
        )
        .then((r) => r.rows[0]!.id);
    const oldWelcome = await platformMail("agency_welcome:ancien", "agency_welcome", "10 days");
    const oldNotice = await platformMail("subscription_notice:ancien", "subscription_notice", "4 days");
    const freshWelcome = await platformMail("agency_welcome:recent", "agency_welcome", "1 hour");
    const claimed = (await rows<{ id: string }>(null, "select id from public.claim_system_emails($1, 50)", [WORKER_SECRET])).map((c) => c.id);
    expect(claimed).toContain(freshWelcome);
    for (const id of [oldWelcome, oldNotice]) {
      expect(claimed).not.toContain(id);
      expect((await db.query("select status, last_error from public.email_outbox where id = $1", [id])).rows[0]).toEqual({
        status: "cancelled",
        last_error: "Annulé : message trop ancien pour être encore utile.",
      });
    }
  });

  it("alertes d'abonnement : au propriétaire, une seule fois par étape, sans lien de désinscription", async () => {
    const original = (
      await db.query<{ status: string; trial_ends_at: string | null; current_period_end: string | null }>(
        "select status, trial_ends_at, current_period_end from public.subscriptions where organization_id = $1",
        [org],
      )
    ).rows[0]!;
    const setSub = (sql: string) => db.query(`update public.subscriptions set ${sql} where organization_id = $1`, [org]);
    const notices = async () =>
      (
        await db.query<{ recipient_email: string; client_id: string | null; payload: Record<string, unknown> }>(
          "select recipient_email, client_id, payload from public.email_outbox where organization_id = $1 and kind = 'subscription_notice' and payload ? 'stage' order by created_at, id",
          [org],
        )
      ).rows;

    try {
      await setSub("status = 'trialing', trial_ends_at = now() + interval '20 days'");
      await schedule();
      expect(await notices()).toEqual([]);

      await setSub("trial_ends_at = now() + interval '5 days'");
      await schedule();
      await schedule();
      expect(await notices()).toHaveLength(1);
      const [week] = await notices();
      expect(week).toMatchObject({ recipient_email: KARL.email, client_id: null });
      expect(week!.payload).toMatchObject({ stage: "trial_7d", owner_name: KARL.name, notice_title: "Votre essai gratuit se termine bientôt" });
      expect(week!.payload).not.toHaveProperty("unsubscribe_token");

      await setSub("trial_ends_at = now() + interval '12 hours'");
      await schedule();
      await setSub("trial_ends_at = now() - interval '1 hour'");
      await schedule();
      await setSub("status = 'suspended'");
      await schedule();
      await setSub("status = 'active', trial_ends_at = null, current_period_end = now() + interval '3 days'");
      await schedule();
      await schedule();
      expect((await notices()).map((n) => n.payload.stage)).toEqual(["trial_7d", "trial_1d", "trial_ended", "suspended", "renewal_7d"]);
      expect((await notices()).find((n) => n.payload.stage === "suspended")!.payload.deadline_at).toBeNull();
    } finally {
      await db.query("update public.subscriptions set status = $2, trial_ends_at = $3, current_period_end = $4 where organization_id = $1", [
        org,
        original.status,
        original.trial_ends_at,
        original.current_period_end,
      ]);
    }
  });
});
