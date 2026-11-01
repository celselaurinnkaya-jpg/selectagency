import "server-only";
import { can } from "@/lib/auth/permissions";
import { fetchRows, readAgency } from "@/lib/data/agency";
import { TICKET, TICKET_MESSAGE, toTicket, toTicketMessage } from "@/lib/data/rows";

// Demandes de l'agence à l'équipe SELECT. Les responsables voient toutes les demandes de l'agence,
// les autres membres celles qu'ils ont ouvertes (RLS de support_tickets).

export async function listTickets() {
  const { data, ctx } = await readAgency({});
  const tickets = (await fetchRows(ctx, "support_tickets", TICKET.list, undefined, ["updated_at", "id"])).map(toTicket).reverse();
  return {
    agency: data.agency,
    tickets: tickets.map((ticket) => ({ ticket, author: data.members.find((m) => m.id === ticket.createdBy) })),
    seesAll: can(ctx.member.role, "team.manage"),
  };
}

export async function getTicket(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, ctx } = await readAgency({});
  const [row] = await fetchRows(ctx, "support_tickets", TICKET.list, (q) => q.eq("id", id));
  if (!row) return null;
  const messages = (await fetchRows(ctx, "support_messages", TICKET_MESSAGE.list, (q) => q.eq("ticket_id", id), ["created_at", "id"])).map(toTicketMessage);
  const ticket = toTicket(row);
  return { agency: data.agency, ticket, messages, author: data.members.find((m) => m.id === ticket.createdBy) };
}
