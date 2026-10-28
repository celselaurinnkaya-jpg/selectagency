import type { AgencyData } from "@/lib/domain/types";
import type { CaseStep, Client, Member, StepKind, TravelCase } from "@/lib/domain/types";
import { caseFinance, type CaseFinance } from "@/features/finance/calculations";
import { currentStep } from "@/features/workflows/rules";

// Vue consolidée d'un dossier, calculée à partir des données : rien n'est stocké en double.

export interface CaseSummary {
  travelCase: TravelCase;
  client: Client;
  assignee?: Member;
  current?: CaseStep;
  /** Qui doit agir maintenant : l'agence, le client ou un tiers. */
  waitingOn?: StepKind;
  finance: CaseFinance;
  missingRequired: number;
  toReview: number;
  toCorrect: number;
  isOverdue: boolean;
}

export function summarizeCase(data: Pick<AgencyData, "clients" | "steps" | "requirements" | "members" | "charges" | "payments">, travelCase: TravelCase, now: Date): CaseSummary {
  const client = data.clients.find((c) => c.id === travelCase.clientId);
  if (!client) throw new Error(`Client introuvable pour le dossier ${travelCase.reference}`);
  const steps = data.steps.filter((s) => s.caseId === travelCase.id);
  const current = travelCase.status === "active" ? currentStep(steps) : undefined;
  const requirements = data.requirements.filter((r) => r.caseId === travelCase.id);
  return {
    travelCase,
    client,
    assignee: data.members.find((m) => m.id === travelCase.assignedTo),
    current,
    waitingOn: current?.kind,
    finance: caseFinance(
      travelCase.billingCurrency,
      data.charges.filter((c) => c.caseId === travelCase.id),
      data.payments.filter((p) => p.caseId === travelCase.id),
    ),
    missingRequired: requirements.filter((r) => r.isRequired && (r.status === "not_received" || r.status === "to_correct" || r.status === "expired")).length,
    toReview: requirements.filter((r) => r.status === "received" || r.status === "to_verify").length,
    toCorrect: requirements.filter((r) => r.status === "to_correct").length,
    isOverdue:
      travelCase.status === "active" && !!travelCase.nextActionDueAt && new Date(travelCase.nextActionDueAt).getTime() < now.getTime(),
  };
}
