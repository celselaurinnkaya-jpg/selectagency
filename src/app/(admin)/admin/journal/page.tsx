import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader } from "@/components/shared/ui";
import { SUBSCRIPTION_STATUS } from "@/lib/domain/labels";
import type { SubscriptionStatus } from "@/lib/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { AUDIT_ACTIONS, CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listAudit, type AuditEntry } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Journal" };

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Journal" description="Chaque action faite dans la console, par qui et quand. Le journal ne peut être ni modifié ni effacé depuis l'application." />
      <Suspense fallback={<PageSkeleton />}>
        <Audit />
      </Suspense>
    </>
  );
}

/** Résumé lisible des détails enregistrés avec l'action. */
function summary(entry: AuditEntry): string {
  const d = entry.details;
  const parts: string[] = [];
  if (typeof d.plan === "string") parts.push(`formule « ${d.plan} »`);
  if (typeof d.ticket === "string") parts.push(`demande ${d.ticket}`);
  if (typeof d.amount_minor === "number" && typeof d.currency === "string") parts.push(formatMoney(d.amount_minor, d.currency));
  if (typeof d.reference === "string") parts.push(`réf. ${d.reference}`);
  const after = d.after as { status?: SubscriptionStatus } | undefined;
  if (after?.status) parts.push(`statut : ${SUBSCRIPTION_STATUS[after.status]?.label ?? after.status}`);
  if (typeof d.reason === "string") parts.push(`motif : « ${d.reason} »`);
  return parts.join(" · ");
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
              {entry.actorEmail}
              {entry.organizationId && (
                <>
                  {" · "}
                  <Link href={`/admin/agences/${entry.organizationId}`} className="font-medium text-navy-700 hover:underline">
                    {entry.organizationName ?? "Agence supprimée"}
                  </Link>
                </>
              )}
              {summary(entry) && ` · ${summary(entry)}`}
            </p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
