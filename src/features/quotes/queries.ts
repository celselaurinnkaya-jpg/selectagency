import "server-only";
import { allowed } from "@/lib/auth/permissions";
import type { AgencyContext } from "@/lib/auth/context";
import { fetchRows, loadTables, readAgency } from "@/lib/data/agency";
import { QUOTE, QUOTE_ITEM, toQuote, toQuoteItem } from "@/lib/data/rows";
import type { Quote } from "@/lib/domain/types";

// Devis des dossiers (lisibles par les rôles qui voient la finance, comme les prestations).

export const quoteTotal = (quote: Pick<Quote, "items">) => quote.items.reduce((sum, i) => sum + i.quantity * i.unitAmountMinor, 0);

export async function loadQuotes(ctx: AgencyContext, caseId?: string): Promise<Quote[]> {
  const quoteRows = await fetchRows(ctx, "quotes", QUOTE.list, caseId ? (q) => q.eq("case_id", caseId) : undefined, ["created_at", "id"]);
  if (quoteRows.length === 0) return [];
  const itemRows = await fetchRows(ctx, "quote_items", QUOTE_ITEM.list, (q) => q.in("quote_id", quoteRows.map((r) => String(r.id))), ["quote_id", "position"]);
  const items = itemRows.map(toQuoteItem);
  return quoteRows.map((r) => toQuote(r, items.filter((i) => i.quoteId === String(r.id)))).reverse();
}

export async function listQuotes() {
  const { data, ctx } = await readAgency({ cases: true, clients: true });
  const canSeeFinance = allowed(ctx, "finance.read");
  const quotes = canSeeFinance ? await loadQuotes(ctx) : [];
  return {
    agency: data.agency,
    canSeeFinance,
    rows: quotes.map((quote) => ({
      quote,
      total: quoteTotal(quote),
      travelCase: data.cases.find((c) => c.id === quote.caseId),
      client: data.clients.find((c) => c.id === quote.clientId),
    })),
  };
}

export async function getQuote(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, ctx, now } = await readAgency({});
  if (!allowed(ctx, "finance.read")) return null;
  const [row] = await fetchRows(ctx, "quotes", QUOTE.list, (q) => q.eq("id", id));
  if (!row) return null;
  const items = (await fetchRows(ctx, "quote_items", QUOTE_ITEM.list, (q) => q.eq("quote_id", id), ["position"])).map(toQuoteItem);
  const quote = toQuote(row, items);
  const { cases = [], clients = [] } = await loadTables(ctx, { cases: (q) => q.eq("id", quote.caseId), clients: (q) => q.eq("id", quote.clientId) });
  return {
    quote,
    total: quoteTotal(quote),
    agency: data.agency,
    isDemo: ctx.isDemo,
    now,
    travelCase: cases[0]!,
    client: clients[0]!,
    author: data.members.find((m) => m.id === quote.createdBy),
    canWrite: allowed(ctx, "finance.write"),
  };
}
