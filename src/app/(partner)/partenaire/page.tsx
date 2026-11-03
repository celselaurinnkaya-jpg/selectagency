import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, Hourglass, Users, Wallet } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatCard, StatusBadge } from "@/components/shared/ui";
import { requireSessionUser } from "@/lib/auth/context";
import { COMMISSION_STATUS } from "@/lib/domain/labels";
import type { CommissionStatus } from "@/lib/domain/types";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Espace partenaire" };

// Ce que la base renvoie au partenaire (partner_portal) : rien d'autre n'est lisible pour lui.
interface PortalClient {
  label: string;
  since: string;
  progress: string;
  commission_status: CommissionStatus | null;
  amount_minor: number | null;
  commission_currency: string | null;
  approved_at: string | null;
  paid_at: string | null;
}

interface Partnership {
  agency_name: string;
  partner_name: string;
  code: string;
  currency: string;
  clients: PortalClient[];
}

export default function PartnerPortalPage() {
  return (
    <>
      <PageHeader title="Espace partenaire" description="Les clients que vous avez recommandés et vos commissions. Pour toute question, contactez l'agence." />
      <Suspense fallback={<PageSkeleton />}>
        <Portal />
      </Suspense>
    </>
  );
}

const sum = (clients: PortalClient[], status: CommissionStatus, currency: string) =>
  formatMoney(clients.filter((c) => c.commission_status === status).reduce((total, c) => total + (c.amount_minor ?? 0), 0), currency);

async function Portal() {
  const user = await requireSessionUser();
  const { data, error } = await user.supabase.rpc("partner_portal");
  if (error) return <Notice tone="warning">Votre espace n&apos;a pas pu être chargé. Réessayez dans un instant.</Notice>;
  const partnerships = (data ?? []) as Partnership[];
  if (partnerships.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Aucun espace partenaire ouvert"
        description="Ce compte n'est rattaché à aucune agence comme partenaire. Demandez à l'agence de vous envoyer votre lien d'accès."
      />
    );
  }
  const tz = "Africa/Douala";
  return (
    <div className="space-y-8">
      {partnerships.map((p) => (
        <Section key={`${p.agency_name}-${p.code}`} title={p.agency_name} action={<span className="rounded-md bg-white px-2 py-0.5 font-mono text-sm text-slate-800">{p.code}</span>}>
          <p className="mb-4 text-sm text-slate-600">Partenaire : {p.partner_name}. Donnez votre code aux personnes que vous recommandez.</p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Clients recommandés" value={p.clients.length} icon={Users} />
            <StatCard label="En attente" value={<span className="text-base">{sum(p.clients, "pending", p.currency)}</span>} hint="Le client n'a pas encore payé" icon={Hourglass} />
            <StatCard
              label="À recevoir"
              value={<span className="text-base">{sum(p.clients, "approved", p.currency)}</span>}
              hint="Le client a payé"
              icon={Wallet}
              tone={p.clients.some((c) => c.commission_status === "approved") ? "warning" : "navy"}
            />
            <StatCard label="Reçu" value={<span className="text-base">{sum(p.clients, "paid", p.currency)}</span>} hint="Commissions versées" icon={CheckCircle2} tone="success" />
          </div>
          {p.clients.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun client recommandé pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {p.clients.map((c, index) => (
                <li key={index}>
                  <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block font-semibold text-slate-900">{c.label}</span>
                      <span className="block text-sm text-slate-600">
                        Depuis le {formatDate(c.since, tz)} · {c.progress}
                      </span>
                    </span>
                    {c.commission_status && (
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold tabular-nums text-slate-900">{formatMoney(c.amount_minor ?? 0, c.commission_currency ?? p.currency)}</span>
                        <StatusBadge spec={COMMISSION_STATUS[c.commission_status]} />
                        {c.paid_at && <span className="text-xs text-slate-500">le {formatDate(c.paid_at, tz)}</span>}
                      </span>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}
      <Notice>Par confidentialité, vous ne voyez que le prénom et l&apos;initiale des personnes recommandées, et leur avancement général.</Notice>
    </div>
  );
}
