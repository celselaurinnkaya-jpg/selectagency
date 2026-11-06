import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getAgencyContext } from "@/lib/auth/context";
import { forbiddenMessage } from "@/lib/auth/permissions";
import { getWorkflowEditor } from "@/features/workflows/custom";
import { WorkflowEditor } from "@/features/workflows/WorkflowEditor";

export const metadata: Metadata = { title: "Modifier un modèle d'étapes" };

export default function WorkflowEditorPage({ params }: PageProps<"/settings/workflows/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/settings/workflows/[key]">, "params">) {
  const { key } = await params;
  const editor = await getWorkflowEditor(key);
  if (!editor) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/settings/workflows", label: "Retour aux modèles" }}
        title={editor.template.name}
        description="Renommez, ajoutez, déplacez ou retirez des étapes. Les prochains dossiers de cette procédure suivront cette liste ; les dossiers déjà ouverts gardent la leur."
      />
      {editor.canManage && editor.locked ? (
        <FeatureLocked feature="custom_workflows" />
      ) : editor.canManage ? (
        // La clé change après chaque enregistrement : l'éditeur repart de la version enregistrée.
        <WorkflowEditor key={editor.version} templateKey={editor.template.key} steps={editor.steps} customized={editor.customized} />
      ) : (
        <Notice>{forbiddenMessage(await getAgencyContext(), "settings.manage")}</Notice>
      )}
    </div>
  );
}
