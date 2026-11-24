import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { SiteRenderer } from "@/features/website/SiteRenderer";
import { getWebsiteEditor } from "@/features/website/queries";

// Aperçu du brouillon du site, tel que le verront les visiteurs (réservé aux membres de l'agence).
export const metadata: Metadata = { title: "Aperçu du site", robots: { index: false, follow: false } };

export default function WebsitePreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <Preview />
    </Suspense>
  );
}

async function Preview() {
  const editor = await getWebsiteEditor();
  if (editor.locked) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <FeatureLocked feature="website" />
      </div>
    );
  }
  return (
    <>
      <div role="note" className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-sm text-white">
        <span>
          Aperçu du brouillon{editor.saved ? "" : " (contenu d'exemple, pas encore enregistré)"} : {editor.isOnline ? "la version en ligne change seulement à la publication." : "le site n'est pas encore en ligne."}
        </span>
        <Link href="/site-web" className="font-medium underline">
          Retour à l&apos;éditeur
        </Link>
      </div>
      <SiteRenderer content={editor.draft} slug={editor.slug} preview />
    </>
  );
}
