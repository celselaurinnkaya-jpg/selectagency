import { Suspense } from "react";
import type { Metadata } from "next";
import { UnsubscribeClientView } from "./UnsubscribeClientView";

export const metadata: Metadata = { title: "Préférences d'e-mails" };

export default function UnsubscribePage({ params }: PageProps<"/desinscription/[token]">) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
          Chargement…
        </div>
      }
    >
      <UnsubscribeContent params={params} />
    </Suspense>
  );
}

// Ouvrir le lien ne change RIEN : les messageries (Outlook, Gmail…) ouvrent les liens toutes seules pour les
// analyser. La désinscription n'a lieu que lorsque la personne clique sur le bouton.
async function UnsubscribeContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribeClientView token={token} />;
}
