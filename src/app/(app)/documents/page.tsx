import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, StatusBadge } from "@/components/shared/ui";
import { REQUIREMENT_STATUS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { listDocumentQueue, type DocumentView } from "@/features/operations/queries";
import { ReviewDocumentForm } from "@/features/documents/DocumentForms";

export const metadata: Metadata = { title: "Documents" };

const VIEWS: { key: DocumentView; label: string; empty: string }[] = [
  { key: "a-examiner", label: "À examiner", empty: "Aucune pièce reçue en attente de vérification." },
  { key: "manquants", label: "Manquants", empty: "Aucune pièce obligatoire manquante sur les dossiers actifs." },
  { key: "a-corriger", label: "À corriger", empty: "Aucune pièce en attente de correction." },
  { key: "expiration", label: "Expiration proche", empty: "Aucun document n'expire dans les 90 prochains jours." },
  { key: "tous", label: "Toutes les pièces", empty: "Aucune pièce attendue." },
];

export default function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  return (
    <>
      <PageHeader title="Documents" description="Les pièces de tous les dossiers actifs : celles à examiner, celles qui manquent et celles qui expirent bientôt." />
      <Suspense fallback={<PageSkeleton />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/documents">, "searchParams">) {
  const { vue } = await searchParams;
  const view = VIEWS.find((v) => v.key === vue) ?? VIEWS[0]!;
  const { rows, agency, counts } = await listDocumentQueue(view.key);
  const tz = agency.timezone;

  return (
    <>
      <Pills
        label="Vue"
        active={view.key}
        items={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key], href: v.key === "a-examiner" ? "/documents" : `/documents?vue=${v.key}` }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileCheck2} title={view.empty} />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ requirement: r, travelCase, client, expiresSoon }) => (
            <li key={r.id}>
              <Card className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{r.label}</p>
                    <p className="text-sm text-slate-600">
                      <Link href={`/cases/${travelCase.id}?tab=documents`} className="font-medium text-navy-700 hover:underline">
                        {travelCase.reference}
                      </Link>{" "}
                      · {client.firstName} {client.lastName} · {r.isRequired ? "Obligatoire" : "Facultatif"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.fileName && `${r.fileName} · `}
                      {r.receivedAt && `reçu le ${formatDate(r.receivedAt, tz)}`}
                      {r.expiresAt && ` · expire le ${formatDate(`${r.expiresAt}T12:00:00Z`, tz)}`}
                    </p>
                    {r.reviewComment && <p className="mt-1 text-sm text-red-800">À corriger : {r.reviewComment}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge spec={REQUIREMENT_STATUS[r.status]} />
                    {expiresSoon && <StatusBadge spec={{ label: "Expire bientôt", tone: "warning" }} />}
                  </div>
                </div>
                {(r.status === "received" || r.status === "to_verify") && <ReviewDocumentForm requirementId={r.id} label={r.label} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <Notice>
          « Vérifié par l&apos;agence » est un contrôle interne, jamais une validation par une ambassade, un consulat ou une administration.
          Le téléversement des fichiers sera disponible avec le stockage sécurisé (Phase 5).
        </Notice>
      </div>
    </>
  );
}
