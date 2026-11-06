import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { STEP_KIND } from "@/lib/domain/labels";
import { getWorkflowSettings } from "@/features/workflows/custom";
import { WORKFLOW_DISCLAIMER } from "@/features/workflows/templates";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Modèles d'étapes" };

export default function WorkflowsPage() {
  return (
    <>
      <PageHeader
        title="Modèles d'étapes"
        description="Chaque nouveau dossier reçoit une copie des étapes de sa procédure. Adaptez-les à votre façon de travailler : les dossiers déjà ouverts gardent les leurs."
      />
      <SettingsNav active="workflows" />
      <Suspense fallback={<PageSkeleton />}>
        <Templates />
      </Suspense>
    </>
  );
}

async function Templates() {
  const { templates, canManage, locked } = await getWorkflowSettings();
  return (
    <div className="space-y-6">
      {locked && (
        <FeatureLocked feature="custom_workflows">
          Avec la formule STARTER, vos dossiers suivent les étapes standard de chaque procédure (et les modèles déjà adaptés pendant
          l&apos;essai). Les adapter à votre agence est inclus dans PRO et BUSINESS.
        </FeatureLocked>
      )}
      {templates.map(({ template, customized }) => (
        <Section
          key={template.key}
          title={template.name}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {customized && <StatusBadge spec={{ label: "Adapté par l'agence", tone: "navy" }} />}
              {canManage && !locked && (
                <Button asChild variant="outline">
                  <Link href={`/settings/workflows/${template.key}`}>
                    <Pencil aria-hidden />
                    Modifier les étapes
                  </Link>
                </Button>
              )}
            </div>
          }
        >
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
      <Notice title="Modèles indicatifs">{WORKFLOW_DISCLAIMER}</Notice>
    </div>
  );
}
