import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cn } from "cn";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { TICKET_CATEGORY, TICKET_STATUS } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";
import { setTicketStatusAction } from "@/features/admin/actions";
import { AdminReplyForm } from "@/features/admin/AdminForms";
import { CONSOLE_TIMEZONE } from "@/features/admin/display";
import { getTicket } from "@/features/admin/queries";

export const metadata: Metadata = { title: "Demande de support" };

export default function ConsoleTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleTicket params={params} />
    </Suspense>
  );
}

async function ConsoleTicket({ params }: Pick<PageProps<"/admin/support/[id]">, "params">) {
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const tz = CONSOLE_TIMEZONE;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/support", label: "Retour au support" }}
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{ticket.reference}</span>
            <StatusBadge spec={TICKET_STATUS[ticket.status]} />
          </span>
        }
        title={ticket.subject}
        description={
          <>
            <Link href={`/admin/agences/${ticket.organizationId}`} className="font-medium text-navy-700 hover:underline">
              {ticket.organizationName}
            </Link>{" "}
            · {ticket.createdByName ?? "—"}
            {ticket.createdByEmail && ` (${ticket.createdByEmail})`} · {TICKET_CATEGORY[ticket.category]} · ouverte le {formatDate(ticket.createdAt, tz, "dateTime")}
          </>
        }
        actions={
          ticket.status !== "resolved" ? (
            <form action={setTicketStatusAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="status" value="resolved" />
              <button type="submit" className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-800 hover:border-navy-300">
                Clore sans répondre
              </button>
            </form>
          ) : undefined
        }
      />
      <div className="space-y-6">
        <Section title="Échanges">
          <ol className="space-y-3">
            {ticket.messages.map((m) => (
              <li key={m.id} className={cn("flex", m.authorKind === "platform" ? "justify-end" : "justify-start")}>
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
        <Section title="Répondre">
          <Card>
            <AdminReplyForm ticketId={ticket.id} />
          </Card>
        </Section>
      </div>
    </>
  );
}
