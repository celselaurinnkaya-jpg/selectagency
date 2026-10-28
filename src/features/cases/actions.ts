"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db, reference } from "@/lib/demo/store";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import type { ApplicantTag, TravelCase } from "@/lib/domain/types";
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

  const data = db();
  const client = data.clients.find((c) => c.id === input.clientId && !c.archivedAt);
  if (!client) return { message: "Le client choisi est introuvable.", values };
  if (!data.members.some((m) => m.id === input.assignedTo)) return { message: "Le conseiller choisi est introuvable.", values };

  const now = new Date();
  const id = crypto.randomUUID();
  const template = templateForCategory(input.category);
  const travelCase: TravelCase = {
    id,
    reference: reference("DOS", "case", now.getFullYear()),
    clientId: client.id,
    category: input.category,
    title: input.title,
    destinationCountry: input.destinationCountry,
    residenceCountry: client.residenceCountry,
    status: "active",
    outcome: "pending",
    priority: input.priority,
    assignedTo: input.assignedTo,
    nextAction: input.nextAction || template.steps[1]?.label,
    nextActionDueAt: input.nextActionDueAt ? localDateTimeToIso(input.nextActionDueAt, "17:00", data.agency.timezone) : undefined,
    plannedDepartureDate: input.plannedDepartureDate || undefined,
    billingCurrency: data.agency.currency,
    applicantTags,
    details: input.category === "study_abroad" ? { institution: input.institution, program: input.program, intake: input.intake } : {},
    openedAt: now.toISOString(),
    templateKey: template.key,
  };

  // Copie du modèle et de la checklist dans le dossier : les modifications futures des modèles
  // ne changeront pas ce dossier.
  data.cases.push(travelCase);
  data.steps.push(...instantiateSteps(id, template));
  data.requirements.push(...buildRequirements(id, input.category, input.destinationCountry, applicantTags));
  data.events.push({
    id: crypto.randomUUID(),
    at: now.toISOString(),
    actorId: data.currentMemberId,
    clientId: client.id,
    caseId: id,
    text: `Dossier ${travelCase.reference} ouvert (${template.name.toLowerCase()}).`,
  });
  refresh();
  return { ok: true, redirectTo: `/cases/${id}?ok=dossier-cree` };
}

const transitionSchema = z.object({
  caseId: z.string().min(1),
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
  const { caseId, acknowledgeBalance, ...rest } = parsed.data;

  const data = db();
  const travelCase = data.cases.find((c) => c.id === caseId);
  if (!travelCase || travelCase.status !== "active") return { message: "Ce dossier n'est pas modifiable.", values };

  const steps = data.steps.filter((s) => s.caseId === caseId);
  const input: TransitionInput = { ...rest, acknowledgeBalance: acknowledgeBalance === "1" };
  const finance = caseFinance(
    travelCase.billingCurrency,
    data.charges.filter((c) => c.caseId === caseId),
    data.payments.filter((p) => p.caseId === caseId),
  );
  const validation = validateTransition(steps, input, { balanceDueMinor: finance.balanceMinor });
  if (!validation.ok) {
    return { message: validation.error, fieldErrors: validation.field ? { [validation.field]: [validation.error] } : undefined, values };
  }

  const now = new Date().toISOString();
  const result = applyTransition(steps, input, { actorId: data.currentMemberId, at: now });
  data.steps = [...data.steps.filter((s) => s.caseId !== caseId), ...result.steps];
  if (result.outcome) travelCase.outcome = result.outcome;
  if (result.closes) {
    travelCase.status = "closed";
    travelCase.closedAt = now;
    travelCase.nextAction = undefined;
    travelCase.nextActionDueAt = undefined;
  } else {
    travelCase.nextAction = result.to.label;
  }
  data.events.push({ id: crypto.randomUUID(), at: now, actorId: data.currentMemberId, clientId: travelCase.clientId, caseId, text: result.description });
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
  const data = db();
  const travelCase = data.cases.find((c) => c.id === parsed.data.caseId && c.status === "active");
  if (!travelCase) return { message: "Ce dossier n'est pas modifiable.", values };
  if (data.requirements.some((r) => r.caseId === travelCase.id && r.documentTypeCode === parsed.data.documentTypeCode)) {
    return { message: "Cette pièce figure déjà dans la liste du dossier.", values };
  }
  const type = documentType(parsed.data.documentTypeCode);
  data.requirements.push({
    id: crypto.randomUUID(),
    caseId: travelCase.id,
    documentTypeCode: type.code,
    label: type.label,
    category: type.category,
    isRequired: parsed.data.isRequired === "1",
    status: "not_received",
  });
  data.events.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: data.currentMemberId,
    clientId: travelCase.clientId,
    caseId: travelCase.id,
    text: `Pièce ajoutée à la liste du dossier : ${type.label}.`,
  });
  refresh();
  return { ok: true, message: `« ${type.label} » ajouté à la liste.` };
}
