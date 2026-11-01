import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { TICKET_CATEGORY, TICKET_STATUS } from "@/lib/domain/labels";
import type { TicketCategory } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { listTickets } from "@/features/support/queries";
import { NewTicketForm } from "@/features/support/SupportForms";

export const metadata: Metadata = { title: "Aide et support" };

export default function SupportPage({ searchParams }: PageProps<"/support">) {
  return (
    <>
      <PageHeader
        title="Aide et support"
        description="Une question, un problème, l'abonnement ? Écrivez à l'équipe SELECT : sa réponse apparaîtra ici, dans la demande."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Support searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Support({ searchParams }: Pick<PageProps<"/support">, "searchParams">) {
  const [{ categorie }, { tickets, agency, seesAll }] = await Promise.all([searchParams, listTickets()]);
  const category = typeof categorie === "string" && categorie in TICKET_CATEGORY ? (categorie as TicketCategory) : undefined;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title={seesAll ? "Demandes de l'agence" : "Vos demandes"}>
        {tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="Aucune demande pour le moment" description="Vos échanges avec l'équipe SELECT sont conservés ici." />
        ) : (
          <ul className="space-y-2">
            {tickets.map(({ ticket, author }) => (
              <li key={ticket.id}>
                <Link href={`/support/${ticket.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                  <Card className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{ticket.reference}</span>
                      <StatusBadge spec={TICKET_STATUS[ticket.status]} />
                    </div>
                    <p className="font-medium text-slate-900">{ticket.subject}</p>
                    <p className="text-xs text-slate-500">
                      {TICKET_CATEGORY[ticket.category]} · {author?.fullName ?? "—"} · mise à jour le {formatDate(ticket.updatedAt, agency.timezone, "dateTime")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Nouvelle demande" id="nouvelle-demande">
        <Card>
          <NewTicketForm defaultCategory={category} />
        </Card>
        <div className="mt-3">
          <Notice>
            L&apos;équipe SELECT voit votre demande, le nom de l&apos;agence et le vôtre. Elle n&apos;a pas accès aux fiches de vos clients ni à leurs
            documents : décrivez le problème sans y joindre de données personnelles de vos clients.
          </Notice>
        </div>
      </Section>
    </div>
  );
}
