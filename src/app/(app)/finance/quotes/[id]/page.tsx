import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PrintButton } from "@/components/shared/PrintButton";
import { PageHeader, StatusBadge } from "@/components/shared/ui";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { getQuote } from "@/features/quotes/queries";
import { QuoteStatusButtons } from "@/features/quotes/QuoteForms";

export const metadata: Metadata = { title: "Devis" };

export default function QuotePage({ params }: PageProps<"/finance/quotes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Quote params={params} />
    </Suspense>
  );
}

async function Quote({ params }: Pick<PageProps<"/finance/quotes/[id]">, "params">) {
  const { id } = await params;
  const detail = await getQuote(id);
  if (!detail) notFound();
  const { quote: q, total, agency, isDemo, travelCase, client, author, canWrite } = detail;
  const tz = agency.timezone;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="print:hidden">
        <PageHeader
          back={{ href: `/cases/${travelCase.id}?tab=finance`, label: "Retour au dossier" }}
          eyebrow={<StatusBadge spec={QUOTE_STATUS[q.status]} />}
          title={`Devis ${q.reference}`}
          actions={<PrintButton />}
        />
        {canWrite && (
          <div className="mb-4">
            <QuoteStatusButtons quoteId={q.id} status={q.status} />
          </div>
        )}
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white print:rounded-none print:border-0">
        <header className="flex flex-col gap-3 bg-navy-800 px-6 py-5 text-white [print-color-adjust:exact] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">{agency.name}</p>
            <p className="text-sm text-navy-100">{agency.city}</p>
          </div>
          <Logo className="h-8 print:h-7" />
        </header>
        <div className="space-y-6 px-6 py-6">
          <div className="flex flex-col justify-between gap-2 sm:flex-row">
            <div>
              <h2 className="text-xl font-semibold text-navy-800">Devis</h2>
              <p className="font-mono text-sm text-slate-600">{q.reference}</p>
            </div>
            <div className="text-sm text-slate-700 sm:text-right">
              <p>Établi le {formatDate(q.createdAt, tz)}</p>
              {q.validUntil && <p>Valable jusqu&apos;au {formatDate(q.validUntil, tz)}</p>}
            </div>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Client</dt>
              <dd className="font-medium text-slate-900">
                {client.firstName} {client.lastName} ({client.reference})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Dossier</dt>
              <dd className="font-medium text-slate-900">
                {travelCase.reference} — {travelCase.title}
              </dd>
            </div>
          </dl>

          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th scope="col" className="py-2">Désignation</th>
                <th scope="col" className="py-2 text-right">Qté</th>
                <th scope="col" className="py-2 text-right">Prix unitaire</th>
                <th scope="col" className="py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-slate-900">
                    {item.label}
                    <span className="block text-xs text-slate-500">{item.chargeType === "agency_fee" ? "Frais de l'agence" : "Montant destiné à un tiers"}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(item.unitAmountMinor, q.currency)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-900">{formatMoney(item.quantity * item.unitAmountMinor, q.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-800">
                <th scope="row" colSpan={3} className="pt-3 text-left text-base font-semibold text-navy-800">
                  Total
                </th>
                <td className="pt-3 text-right text-base font-semibold tabular-nums text-navy-800">{formatMoney(total, q.currency)}</td>
              </tr>
            </tfoot>
          </table>

          {q.notes && <p className="text-sm whitespace-pre-line text-slate-700">{q.notes}</p>}
          <p className="text-sm text-slate-700">Établi par : {author?.fullName ?? "—"}</p>
          {(q.status === "refused" || q.status === "cancelled") && (
            <p className="rounded-lg bg-slate-100 p-3 text-center font-semibold text-slate-700">{q.status === "refused" ? "DEVIS REFUSÉ" : "DEVIS ANNULÉ"}</p>
          )}

          <footer className="space-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p>
              Les montants destinés à des tiers (frais officiels, établissements…) sont reversés par l&apos;agence ; leur montant final dépend de
              l&apos;organisme. Ce devis ne garantit aucune décision des autorités.
            </p>
            {isDemo && <p className="font-semibold text-orange-800">Document de démonstration : données fictives, sans valeur.</p>}
          </footer>
        </div>
      </article>
    </div>
  );
}
