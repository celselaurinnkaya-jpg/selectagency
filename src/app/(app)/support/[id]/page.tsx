import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cn } from "cn";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { TICKET_CATEGORY, TICKET_STATUS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { resolveTicketAction } from "@/features/support/actions";
import { getTicket } from "@/features/support/queries";
import { ReplyForm } from "@/features/support/SupportForms";

export const metadata: Metadata = { title: "Demande de support" };

export default function TicketPage({ params, searchParams }: PageProps<"/support/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Ticket params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Ticket({ params, searchParams }: PageProps<"/support/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getTicket(id);
  if (!detail) notFound();
  const { ticket, messages, agency, author } = detail;
  const tz = agency.timezone;

  return (
    <>
      <PageHeader
        back={{ href: "/support", label: "Retour aux demandes" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{ticket.reference}</span>
            <StatusBadge spec={TICKET_STATUS[ticket.status]} />
          </span>
        }
        title={ticket.subject}
        description={`${TICKET_CATEGORY[ticket.category]} · ouverte par ${author?.fullName ?? "—"} le ${formatDate(ticket.createdAt, tz, "dateTime")}`}
        actions={
          ticket.status !== "resolved" ? (
            <form action={resolveTicketAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <button type="submit" className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-800 hover:border-navy-300">
                Marquer comme résolue
              </button>
            </form>
          ) : undefined
        }
      />

      {query.ok === "envoyee" && (
        <div className="mb-4">
          <Notice tone="success" title="Demande transmise">
            L&apos;équipe SELECT la voit dans sa console. Sa réponse apparaîtra sur cette page.
          </Notice>
        </div>
      )}

      <div className="space-y-6">
        <Section title="Échanges">
          <ol className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex", m.authorKind === "platform" ? "justify-start" : "justify-end")}>
                <Card className={cn("max-w-2xl space-y-1", m.authorKind === "platform" && "border-l-4 border-citron-500")}>
                  <p className="text-xs font-medium text-slate-500">
                    {m.authorName} · {formatDate(m.createdAt, tz, "dateTime")}
                  </p>
                  <p className="text-sm whitespace-pre-line text-slate-900">{m.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>
        <Section title={ticket.status === "resolved" ? "Rouvrir la demande" : "Ajouter un message"}>
          <Card>
            <ReplyForm ticketId={ticket.id} />
          </Card>
        </Section>
      </div>
    </>
  );
}
