import { Suspense } from "react";
import type { Metadata } from "next";
import { Presentation } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { countryName } from "@/lib/countries";
import type { LabelSpec } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { setDemoRequestStatusAction } from "@/features/admin/actions";
import { CONSOLE_TIMEZONE } from "@/features/admin/display";
import { listDemoRequests, type DemoRequestStatus } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Démonstrations" };

const STATUS: Record<DemoRequestStatus, LabelSpec> = {
  new: { label: "Nouvelle", tone: "warning" },
  contacted: { label: "Recontactée", tone: "info" },
  closed: { label: "Terminée", tone: "neutral" },
};

const FILTERS: { key: DemoRequestStatus | "toutes"; label: string }[] = [
  { key: "new", label: "Nouvelles" },
  { key: "contacted", label: "Recontactées" },
  { key: "closed", label: "Terminées" },
  { key: "toutes", label: "Toutes" },
];

export default function ConsoleDemoRequestsPage({ searchParams }: PageProps<"/admin/demonstrations">) {
  return (
    <>
      <PageHeader
        title="Démonstrations"
        description="Les demandes envoyées depuis le formulaire « Demander une démonstration » du site. Recontactez la personne, puis notez où en est la demande."
      />
      <Suspense fallback={<PageSkeleton />}>
        <DemoRequests searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function DemoRequests({ searchParams }: Pick<PageProps<"/admin/demonstrations">, "searchParams">) {
  const [{ statut }, all] = await Promise.all([searchParams, listDemoRequests()]);
  const filter = FILTERS.find((f) => f.key === statut)?.key ?? "new";
  const rows = filter === "toutes" ? all : all.filter((r) => r.status === filter);
  return (
    <>
      <Pills
        label="Filtrer les demandes"
        active={filter}
        items={FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          href: f.key === "new" ? "/admin/demonstrations" : `/admin/demonstrations?statut=${f.key}`,
          count: f.key === "toutes" ? all.length : all.filter((r) => r.status === f.key).length,
        }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Presentation} title="Aucune demande dans cette liste" />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const whatsapp = r.phone.replace(/\D/g, "");
            return (
              <li key={r.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-navy-800">{r.agencyName}</span>
                    <StatusBadge spec={STATUS[r.status]} />
                  </div>
                  <p className="text-sm text-slate-700">
                    {r.fullName} · {countryName(r.countryCode)} · reçue le {formatDate(r.createdAt, CONSOLE_TIMEZONE, "dateTime")}
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-navy-700 tabular-nums hover:underline">
                      {r.phone}
                    </a>
                    {whatsapp && (
                      <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-700 hover:underline">
                        Écrire sur WhatsApp
                      </a>
                    )}
                    {r.email && (
                      <a href={`mailto:${r.email}`} className="font-medium text-navy-700 hover:underline">
                        {r.email}
                      </a>
                    )}
                  </p>
                  {r.message && <p className="whitespace-pre-line rounded-lg bg-surface p-3 text-sm text-slate-700">{r.message}</p>}
                  <form action={setDemoRequestStatusAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    {r.status !== "contacted" && (
                      <Button type="submit" name="status" value="contacted" variant="outline" size="sm">
                        Marquer recontactée
                      </Button>
                    )}
                    {r.status !== "closed" && (
                      <Button type="submit" name="status" value="closed" variant="outline" size="sm">
                        Marquer terminée
                      </Button>
                    )}
                    {r.status !== "new" && (
                      <Button type="submit" name="status" value="new" variant="ghost" size="sm">
                        Remettre en nouvelle
                      </Button>
                    )}
                  </form>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
