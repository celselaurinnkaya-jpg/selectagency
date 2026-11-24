import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { WebsiteEditor } from "@/features/website/WebsiteEditor";
import { getWebsiteEditor } from "@/features/website/queries";

export const metadata: Metadata = { title: "Site web" };

export default function WebsitePage() {
  return (
    <>
      <PageHeader
        title="Site web de l'agence"
        description="Un site à vos couleurs : choisissez un modèle, décrivez votre agence, l'IA rédige le site, vous le modifiez puis le publiez. Les demandes du formulaire arrivent dans vos prospects."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Editor />
      </Suspense>
    </>
  );
}

async function Editor() {
  const editor = await getWebsiteEditor();
  if (editor.locked) {
    return (
      <FeatureLocked feature="website">
        Votre formule STARTER ne comprend pas le site web. Passez en PRO ou BUSINESS pour créer et publier le site de votre agence.
      </FeatureLocked>
    );
  }
  if (!editor.canEdit) {
    return (
      <Notice title={editor.isOnline ? "Le site de l'agence est en ligne" : "Le site de l'agence n'est pas encore publié"}>
        {editor.isOnline ? (
          <>
            Adresse :{" "}
            <a href={editor.publicUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              {editor.publicUrl}
            </a>
            .{" "}
          </>
        ) : null}
        {editor.writable
          ? "Seuls le propriétaire et les administrateurs de l'agence modifient et publient le site."
          : "L'agence est en lecture seule : le site sera modifiable dès l'activation de l'abonnement."}
      </Notice>
    );
  }
  return (
    <WebsiteEditor
      initial={{
        slug: editor.slug,
        brief: editor.brief,
        content: editor.draft,
        saved: editor.saved,
        isOnline: editor.isOnline,
        publishedAt: editor.publishedAt,
        hasUnpublishedChanges: editor.hasUnpublishedChanges,
      }}
      siteBase={editor.siteBase}
      aiConfigured={editor.aiConfigured}
      facts={editor.facts}
    />
  );
}
