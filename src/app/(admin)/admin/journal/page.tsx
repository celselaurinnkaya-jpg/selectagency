import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Download, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader } from "@/components/shared/ui";
import { formatDate } from "@/lib/format";
import { AUDIT_ACTIONS, auditSummary, CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listAudit } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Journal" };

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Journal" description="Chaque action faite dans la console, par qui et quand, et tout changement d'abonnement fait ailleurs (Stripe, base de données), avec son origine. Le journal ne peut être ni modifié ni effacé depuis l'application."
        actions={
          <Button asChild variant="outline">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- téléchargement d'un fichier CSV (route), pas une page */}
            <a href="/admin/export/journal" download>
              <Download aria-hidden />
              Exporter (CSV)
            </a>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Audit />
      </Suspense>
    </>
  );
}

async function Audit() {
  const entries = await listAudit();
  if (entries.length === 0) return <EmptyState icon={ScrollText} title="Aucune action pour le moment" />;
  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Card className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{AUDIT_ACTIONS[entry.action] ?? entry.action}</span>
              <span className="text-xs text-slate-500 tabular-nums">{formatDate(entry.at, CONSOLE_TIMEZONE, "dateTime")}</span>
            </div>
            <p className="text-xs text-slate-500">
              {entry.actorEmail || "système"}
              {entry.organizationId && (
                <>
                  {" · "}
                  <Link href={`/admin/agences/${entry.organizationId}`} className="font-medium text-navy-700 hover:underline">
                    {entry.organizationName ?? "Agence supprimée"}
                  </Link>
                </>
              )}
              {auditSummary(entry.details) && ` · ${auditSummary(entry.details)}`}
            </p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
