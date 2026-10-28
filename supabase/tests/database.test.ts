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
}

const user = (n: number, email: string, name: string): User => ({ id: `00000000-0000-4000-8000-00000000000${n}`, email, name });
const ALICE = user(1, "alice@agence-a.test", "Alice Owona");
const BRUNO = user(2, "bruno@agence-b.test", "Bruno Kamdem");
const CARINE = user(3, "carine@agence-a.test", "Carine Abena");
const VICTOR = user(4, "victor@agence-a.test", "Victor Mballa");
const DIANE = user(5, "diane@demo.test", "Diane Essomba");
const ERIC = user(6, "eric@agence-e.test", "Éric Fouda");
const FRANCK = user(7, "franck@essai.test", "Franck Nana");

let db: PGlite;

async function as<T>(who: User | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (who) {
      const claims = { sub: who.id, email: who.email, role: "authenticated", user_metadata: { full_name: who.name } };
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
  for (const u of [ALICE, BRUNO, CARINE, VICTOR, DIANE, ERIC, FRANCK]) {
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
