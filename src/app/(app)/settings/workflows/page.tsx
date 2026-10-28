import type { Metadata } from "next";
import { Card, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { STEP_KIND } from "@/lib/domain/labels";
import { WORKFLOW_DISCLAIMER, WORKFLOW_TEMPLATES } from "@/features/workflows/templates";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Modèles d'étapes" };

// Les modèles sont du code statique pour l'instant : la page est entièrement prérendue.
export default function WorkflowsPage() {
  return (
    <>
      <PageHeader title="Modèles d'étapes" description="Chaque nouveau dossier reçoit une copie du modèle de son type de projet. Modifier un modèle ne change pas les dossiers déjà ouverts." />
      <SettingsNav active="workflows" />
      <div className="space-y-6">
        {WORKFLOW_TEMPLATES.map((template) => (
          <Section key={template.key} title={template.name}>
            <p className="mb-3 text-sm text-slate-600">{template.description}</p>
            <ol className="grid gap-2 md:grid-cols-2">
              {template.steps.map((step, index) => (
                <li key={step.key}>
                  <Card className="flex items-start gap-3 py-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-citron-400">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {step.label}
                        {step.optional && <span className="font-normal text-slate-500"> (facultative)</span>}
                      </span>
                      <StatusBadge className="mt-1" spec={{ label: STEP_KIND[step.kind].label, tone: STEP_KIND[step.kind].tone }} />
                      {step.next && <span className="mt-1 block text-xs text-slate-500">Suites possibles : {step.next.map((n) => n.label).join(" · ")}</span>}
                    </span>
                  </Card>
                </li>
              ))}
            </ol>
          </Section>
        ))}
        <Notice title="Modèles indicatifs">
          {WORKFLOW_DISCLAIMER} L&apos;éditeur de modèles (ajouter, renommer, réordonner des étapes) est prévu avec la base de données.
        </Notice>
      </div>
    </>
  );
}
