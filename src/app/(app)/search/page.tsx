import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, Section } from "@/components/shared/ui";
import { CATEGORY_SHORT_LABELS, CLIENT_TYPE, INVOICE_STATUS } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { caseKindLabel } from "@/features/workflows/templates";
import { search } from "@/features/operations/queries";
import { BureauBadge } from "@/features/bureaux/BureauBadge";
import { bureauById } from "@/features/bureaux/display";

export const metadata: Metadata = { title: "Recherche" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageHeader title="Recherche" description="Retrouvez un client ou un prospect par son nom, son téléphone ou sa référence ; un dossier par sa référence ou son intitulé ; une facture (FAC-…) ou un reçu par son numéro." />
      <Suspense fallback={<PageSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const results = await search(query);
  const searched = query.trim().length >= 2;

  return (
    <div className="space-y-6">
      <Form action="/search" className="flex gap-2">
        <label htmlFor="q-page" className="sr-only">
          Rechercher
        </label>
        <Input id="q-page" name="q" type="search" defaultValue={query} placeholder="Nom, téléphone, CLI-…, DOS-…, FAC-…" className="flex-1" />
        <Button type="submit">
          <Search aria-hidden />
          Rechercher
        </Button>
      </Form>
      {searched && (
        <>
          <Section title={`Clients et prospects (${results.clients.length})`}>
            {results.clients.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun client trouvé.</p>
            ) : (
              <ul className="space-y-2">
                {results.clients.map((c) => (
                  <li key={c.id}>
                    <Link href={c.status === "prospect" ? `/prospects/${c.id}` : `/clients/${c.id}`}>
                      <Card className="hover:ring-2 hover:ring-navy-200">
                        <span className="flex items-center gap-1.5 font-medium text-navy-800">
                          <BureauBadge bureau={bureauById(results.bureaux, c.bureauId)} />
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="block text-sm text-slate-600">
                          {[c.reference, c.status === "prospect" ? "Prospect" : CLIENT_TYPE[c.clientType], c.city].filter(Boolean).join(" · ")}
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={`Dossiers (${results.cases.length})`}>
            {results.cases.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun dossier trouvé.</p>
            ) : (
              <ul className="space-y-2">
                {results.cases.map(({ travelCase: k, client }) => (
                  <li key={k.id}>
                    <Link href={`/cases/${k.id}`}>
                      <Card className="hover:ring-2 hover:ring-navy-200">
                        <span className="flex items-center gap-1.5 font-medium text-navy-800">
                          <BureauBadge bureau={bureauById(results.bureaux, client.bureauId)} />
                          {k.title}
                        </span>
                        <span className="block text-sm text-slate-600">
                          {k.reference} · {caseKindLabel(k.templateKey, CATEGORY_SHORT_LABELS[k.category])} · {client.firstName} {client.lastName}
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {(results.invoices.length > 0 || results.receipts.length > 0) && (
            <Section title={`Factures et reçus (${results.invoices.length + results.receipts.length})`}>
              <ul className="space-y-2">
                {results.invoices.map(({ invoice: inv, clientName }) => (
                  <li key={inv.id}>
                    <Link href={`/finance/invoices/${inv.id}`}>
                      <Card className="flex flex-col gap-1 hover:ring-2 hover:ring-navy-200 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          <span className="font-medium text-navy-800">Facture {inv.number}</span>
                          <span className="block text-sm text-slate-600">
                            {clientName} · {INVOICE_STATUS[inv.status].label}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatMoney(inv.totalMinor, inv.currency)}</span>
                      </Card>
                    </Link>
                  </li>
                ))}
                {results.receipts.map((r) => (
                  <li key={r.id}>
                    <Link href={`/finance/receipts/${r.id}`}>
                      <Card className="flex flex-col gap-1 hover:ring-2 hover:ring-navy-200 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          <span className="font-medium text-navy-800">Reçu {r.receiptNumber}</span>
                          <span className="block text-sm text-slate-600">
                            {r.clientName}
                            {r.voided && " · annulé"}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatMoney(r.amountMinor, r.currency)}</span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {!searched && query && <p className="text-sm text-slate-600">Saisissez au moins deux caractères.</p>}
    </div>
  );
}
