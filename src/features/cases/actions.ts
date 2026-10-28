"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { can, FORBIDDEN_MESSAGE } from "@/lib/auth/permissions";
import { loadTables, readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { stepToRow } from "@/lib/data/rows";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import type { ApplicantTag } from "@/lib/domain/types";
import { buildRequirements, documentType, DOCUMENT_TYPES } from "@/features/documents/checklists";
import { caseFinance } from "@/features/finance/calculations";
import { instantiateSteps } from "@/features/workflows/instantiate";
import { applyTransition, validateTransition, type TransitionInput } from "@/features/workflows/rules";
import { templateForCategory } from "@/features/workflows/templates";

const categories = ["study_abroad", "tourist_visa", "business_travel", "administrative_support", "other_mobility", "custom_trip"] as const;
const tags = ["student", "employee", "self_employed", "minor", "sponsored"] as const;
const dateOnly = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")]).optional();

const caseSchema = z.object({
  clientId: z.string().min(1, "Choisissez le client."),
  category: z.enum(categories, { error: "Choisissez le type de projet." }),
  destinationCountry: z.string().trim().min(1, "Choisissez la destination.").max(80),
  title: z.string().trim().min(3, "Donnez un intitulé court au dossier.").max(120),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedTo: z.string().min(1, "Choisissez le conseiller."),
  nextAction: z.string().trim().max(200).optional(),
  nextActionDueAt: dateOnly,
  plannedDepartureDate: dateOnly,
  institution: z.string().trim().max(120).optional(),
  program: z.string().trim().max(120).optional(),
  intake: z.string().trim().max(60).optional(),
});

export async function createCaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const rawDest = formData.get("destinationCountry")?.toString().trim();
  const customDest = formData.get("customDestinationCountry")?.toString().trim();
  const destinationCountry = (rawDest === "__OTHER__" || rawDest === "other")
    ? (customDest || "")
    : (rawDest || "");

  const values = formValues(formData);
  values.destinationCountry = destinationCountry;
  const parsed = caseSchema.safeParse(values);
  if (!parsed.success) {
    return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const input = parsed.data;
  const applicantTags = formData.getAll("applicantTags").filter((t): t is ApplicantTag => (tags as readonly string[]).includes(String(t)));

  const { data, ctx } = await readAgency({ clients: (q) => q.eq("id", input.clientId).is("archived_at", null) });
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE, values };
  const client = data.clients[0];
  if (!client) return { message: "Le client choisi est introuvable.", values };
  if (!data.members.some((m) => m.id === input.assignedTo)) return { message: "Le conseiller choisi est introuvable.", values };

  // Copie du modèle et de la checklist dans le dossier : les modifications futures des modèles
  // ne changeront pas ce dossier. La base attribue le numéro DOS-… et écrit l'historique.
  const template = templateForCategory(input.category);
  const steps = instantiateSteps("nouveau", template).map((s) => ({
    position: s.position,
    key: s.key,
    label: s.label,
    kind: s.kind,
    is_optional: s.isOptional,
    outcome: s.outcome ?? null,
    next: s.next ?? null,
    status: s.status,
  }));
  const requirements = buildRequirements("nouveau", input.category, input.destinationCountry, applicantTags).map((r) => ({
    document_type_code: r.documentTypeCode,
    label: r.label,
    category: r.category,
    is_required: r.isRequired,
  }));

  const { data: created, error } = await ctx.supabase.rpc("create_case", {
    p_case: {
      organization_id: ctx.organizationId,
      client_id: client.id,
      category: input.category,
      title: input.title,
      destination_country: input.destinationCountry,
      residence_country: client.residenceCountry,
      priority: input.priority,
      assigned_to: input.assignedTo,
      next_action: input.nextAction || template.steps[1]?.label || null,
      next_action_due_at: input.nextActionDueAt ? localDateTimeToIso(input.nextActionDueAt, "17:00", data.agency.timezone) : null,
      planned_departure_date: input.plannedDepartureDate || null,
      billing_currency: data.agency.currency,
      applicant_tags: applicantTags,
      details: input.category === "study_abroad" ? { institution: input.institution, program: input.program, intake: input.intake } : {},
      template_key: template.key,
    },
    p_steps: steps,
    p_requirements: requirements,
    p_template_name: template.name.toLowerCase(),
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, redirectTo: `/cases/${(created as { id: string }).id}?ok=dossier-cree` };
}

const transitionSchema = z.object({
  caseId: z.string().min(1),
  version: z.coerce.number().int().positive(),
  mode: z.enum(["advance", "skip", "back"]),
  to: z.string().optional(),
  confirmation: z.enum(["declared", "confirmed"]).optional(),
  evidenceRef: z.string().max(300).optional(),
  sourceNote: z.string().max(300).optional(),
  reason: z.string().max(500).optional(),
  acknowledgeBalance: z.literal("1").optional(),
});

export async function transitionCaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = transitionSchema.safeParse(values);
  if (!parsed.success) return { message: "Demande incomplète.", values };
  const { caseId, version, acknowledgeBalance, ...rest } = parsed.data;

  const { data, ctx } = await readAgency({
    cases: (q) => q.eq("id", caseId),
    steps: (q) => q.eq("case_id", caseId),
    charges: (q) => q.eq("case_id", caseId),
    payments: (q) => q.eq("case_id", caseId),
  });
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE, values };
  const travelCase = data.cases[0];
  if (!travelCase || travelCase.status !== "active") return { message: "Ce dossier n'est pas modifiable.", values };
  if (travelCase.version !== version) {
    return { message: "Ce dossier vient d'être modifié par une autre personne. Rechargez la page, puis recommencez.", values };
  }

  const input: TransitionInput = { ...rest, acknowledgeBalance: acknowledgeBalance === "1" };
  // Un conseiller sans accès à la finance ne voit pas le solde : la base ne lui renvoie aucune ligne.
  const finance = caseFinance(travelCase.billingCurrency, data.charges, data.payments);
  const validation = validateTransition(data.steps, input, { balanceDueMinor: finance.balanceMinor });
  if (!validation.ok) {
    return { message: validation.error, fieldErrors: validation.field ? { [validation.field]: [validation.error] } : undefined, values };
  }

  const now = new Date().toISOString();
  const result = applyTransition(data.steps, input, { actorId: ctx.member.id, at: now });
  const casePatch = result.closes
    ? { status: "closed", closed_at: now, next_action: null, next_action_due_at: null, outcome: result.outcome ?? null }
    : { next_action: result.to.label, ...(result.outcome ? { outcome: result.outcome } : {}) };

  const { error } = await ctx.supabase.rpc("apply_case_transition", {
    p_case_id: caseId,
    p_version: version,
    p_steps: result.steps.map(stepToRow),
    p_case: casePatch,
    p_event: result.description,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: result.closes ? "Dossier clôturé." : `Étape en cours : « ${result.to.label} ».` };
}

const requirementSchema = z.object({
  caseId: z.string().min(1),
  documentTypeCode: z.string().refine((code) => DOCUMENT_TYPES.some((t) => t.code === code), "Choisissez un type de document."),
  isRequired: z.literal("1").optional(),
});

export async function addRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = requirementSchema.safeParse(values);
  if (!parsed.success) return { message: "Choisissez un type de document.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const { data, ctx } = await readAgency({ cases: (q) => q.eq("id", parsed.data.caseId).eq("status", "active") });
  if (!can(ctx.member.role, "operations.write")) return { message: FORBIDDEN_MESSAGE, values };
  const travelCase = data.cases[0];
  if (!travelCase) return { message: "Ce dossier n'est pas modifiable.", values };
  const { requirements = [] } = await loadTables(ctx, { requirements: (q) => q.eq("case_id", travelCase.id) });
  if (requirements.some((r) => r.documentTypeCode === parsed.data.documentTypeCode)) {
    return { message: "Cette pièce figure déjà dans la liste du dossier.", values };
  }
  const type = documentType(parsed.data.documentTypeCode);
  const { error } = await ctx.supabase.from("document_requirements").insert({
    organization_id: ctx.organizationId,
    case_id: travelCase.id,
    document_type_code: type.code,
    label: type.label,
    category: type.category,
    is_required: parsed.data.isRequired === "1",
    status: "not_received",
  });
  if (error) return { message: dbMessage(error), values };
  await ctx.supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.member.id,
    client_id: travelCase.clientId,
    case_id: travelCase.id,
    text: `Pièce ajoutée à la liste du dossier : ${type.label}.`,
  });
  refresh();
  return { ok: true, message: `« ${type.label} » ajouté à la liste.` };
}
