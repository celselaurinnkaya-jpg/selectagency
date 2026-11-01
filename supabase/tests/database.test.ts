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
  for (const u of [ALICE, BRUNO, CARINE, VICTOR, DIANE, ERIC, FRANCK, GRACE, HUGO, IRENE, JULES, KARL, LINA, MAX, NOAH]) {
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
    expect(overview.o.users).toBe(15);
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
});
