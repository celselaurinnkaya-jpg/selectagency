import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/shared/ui";
import { TICKET_CATEGORY, TICKET_STATUS } from "@/lib/domain/labels";
import type { TicketStatus } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listTickets } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Support" };

const FILTERS: { key: TicketStatus | "toutes"; label: string }[] = [
  { key: "open", label: "En attente de SELECT" },
  { key: "answered", label: "Répondues" },
  { key: "resolved", label: "Résolues" },
  { key: "toutes", label: "Toutes" },
];

export default function ConsoleSupportPage({ searchParams }: PageProps<"/admin/support">) {
  return (
    <>
      <PageHeader title="Support" description="Les demandes des agences. Votre réponse apparaît dans la demande, côté agence, signée « Équipe SELECT »." />
      <Suspense fallback={<PageSkeleton />}>
        <Tickets searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Tickets({ searchParams }: Pick<PageProps<"/admin/support">, "searchParams">) {
  const [{ statut }, all] = await Promise.all([searchParams, listTickets()]);
  const filter = FILTERS.find((f) => f.key === statut)?.key ?? "open";
  const rows = filter === "toutes" ? all : all.filter((t) => t.status === filter);
  return (
    <>
      <Pills
        label="Filtrer les demandes"
        active={filter}
        items={FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          href: f.key === "open" ? "/admin/support" : `/admin/support?statut=${f.key}`,
          count: f.key === "toutes" ? all.length : all.filter((t) => t.status === f.key).length,
        }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Aucune demande dans cette liste" />
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                <Card className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">{t.reference}</span>
                    <StatusBadge spec={TICKET_STATUS[t.status]} />
                  </div>
                  <p className="font-medium text-slate-900">{t.subject}</p>
                  <p className="text-xs text-slate-500">
                    {t.organizationName} · {t.createdByName ?? "—"} · {TICKET_CATEGORY[t.category]} · {t.messages} message(s) · {formatDate(t.updatedAt, CONSOLE_TIMEZONE, "dateTime")}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
