/* eslint-disable @next/next/no-img-element -- images privées servies par l'application, déjà dimensionnées */
import { cn } from "cn";
import { formatMoney, initials } from "@/lib/format";
import { discountTitle, formatDay, watermark, type InvoiceDocumentData, type InvoiceImages, type InvoiceParty } from "./document";
import { formatTaxRate, invoiceTotals, lineAmount } from "./totals";

// Facture telle qu'elle est remise au client : aperçu du formulaire, page imprimable (le PDF
// reprend la même mise en page). Composant d'affichage pur, utilisable côté serveur et navigateur.

export function InvoiceDocument({ data, images, className }: { data: InvoiceDocumentData; images: InvoiceImages; className?: string }) {
  const totals = invoiceTotals(data.items, data.discountMinor);
  const money = (amount: number) => formatMoney(amount, data.currency);
  const mark = watermark(data.status);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl bg-white print:overflow-visible text-slate-800 shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-slate-200 [print-color-adjust:exact] print:rounded-none print:shadow-none print:ring-0",
        className,
      )}
    >
      {mark && (
        <p aria-hidden className="pointer-events-none absolute inset-0 flex -rotate-[30deg] items-center justify-center text-6xl font-bold tracking-widest text-slate-200/80 select-none sm:text-8xl">
          {mark}
        </p>
      )}
      <div className="relative space-y-6 p-5 sm:p-8 print:space-y-4 print:p-0">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">FACTURE</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              N° de facture
              <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-xs text-slate-800">{data.number ?? "attribué à l'enregistrement"}</span>
            </p>
          </div>
          {images.logo ? (
            <img src={images.logo} alt={`Logo de ${data.issuer.name}`} className="max-h-16 max-w-32 object-contain sm:max-h-20 sm:max-w-44" />
          ) : (
            <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-navy-800 text-lg font-bold text-citron-400">
              {initials(data.issuer.name)}
            </span>
          )}
        </header>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-200 pt-5 text-xs sm:text-sm">
          <Party title="Émise par" party={data.issuer} />
          <Party title="Facturée à" party={data.recipient} />
          <div>
            <p className="text-slate-500">Date d&apos;émission</p>
            <p className="font-semibold text-slate-900">{formatDay(data.issueDate)}</p>
          </div>
          <div>
            <p className="text-slate-500">Date d&apos;échéance</p>
            <p className="font-semibold text-slate-900">{formatDay(data.dueDate)}</p>
          </div>
          {data.caseLabel && <p className="col-span-2 text-slate-600">Dossier : {data.caseLabel}</p>}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-600 sm:text-sm">Prestations</p>
          {/* Téléphone : une ligne par prestation (le tableau ne tient pas en largeur). */}
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-xs sm:hidden print:hidden">
            {data.items.length === 0 ? (
              <li className="py-3 text-slate-500">Aucune ligne pour l&apos;instant.</li>
            ) : (
              data.items.map((item, index) => (
                <li key={index} className="py-2">
                  <p className="font-medium text-slate-900">{item.label || "—"}</p>
                  <div className="mt-0.5 flex justify-between gap-3 text-slate-600">
                    <span className="tabular-nums">
                      {item.quantity} × {money(item.unitAmountMinor)} · taxe {formatTaxRate(item.taxRate)}
                    </span>
                    <span className="font-medium whitespace-nowrap tabular-nums text-slate-900">{money(lineAmount(item))}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
          <table className="hidden w-full text-xs sm:table sm:text-sm print:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th scope="col" className="py-2 pr-2 font-medium">Désignation</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Qté</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Prix unit.</th>
                <th scope="col" className="px-1 py-2 text-right font-medium">Taxe</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-slate-500">Aucune ligne pour l&apos;instant.</td>
                </tr>
              ) : (
                data.items.map((item, index) => (
                  <tr key={index} className="align-top break-inside-avoid">
                    <td className="py-2 pr-2 text-slate-900">{item.label || "—"}</td>
                    <td className="px-1 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-1 py-2 text-right whitespace-nowrap tabular-nums">{money(item.unitAmountMinor)}</td>
                    <td className="px-1 py-2 text-right whitespace-nowrap tabular-nums">{formatTaxRate(item.taxRate)}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums text-slate-900">{money(lineAmount(item))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-start justify-between gap-4 break-inside-avoid">
          {data.status === "paid" ? (
            <p className="mt-2 -rotate-[8deg] rounded-md border-2 border-emerald-600 px-3 py-1 text-lg font-bold tracking-widest text-emerald-700">PAYÉE</p>
          ) : (
            <span />
          )}
          <dl className="w-full max-w-xs space-y-1.5 rounded-lg bg-surface p-3 text-xs sm:max-w-sm sm:text-sm">
            <Amount label="Sous-total" value={money(totals.subtotalMinor)} />
            {totals.taxMinor > 0 && <Amount label="Taxes" value={money(totals.taxMinor)} />}
            {totals.discountMinor > 0 && <Amount label={discountTitle(data.discountLabel)} value={`− ${money(totals.discountMinor)}`} />}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 font-bold text-navy-800">
              <dt>Total à payer</dt>
              <dd className="tabular-nums">{money(totals.totalMinor)}</dd>
            </div>
          </dl>
        </div>

        {data.notes && <p className="break-inside-avoid rounded-md border border-slate-200 px-3 py-2 text-xs whitespace-pre-line text-slate-600">{data.notes}</p>}

        <div className="grid grid-cols-2 items-end gap-4 border-t border-slate-200 pt-5 text-xs break-inside-avoid sm:text-sm print:pt-3">
          <div>
            {data.paymentDetails && (
              <>
                <p className="font-semibold text-slate-900">Mode de paiement</p>
                <p className="whitespace-pre-line text-slate-600">{data.paymentDetails}</p>
              </>
            )}
          </div>
          <div className="flex flex-col items-end text-right">
            <div className="relative flex h-24 w-44 items-center justify-center print:h-20">
              {images.stamp && <img src={images.stamp} alt="Cachet de l'agence" className="absolute inset-0 m-auto max-h-24 max-w-28 object-contain opacity-90" />}
              {images.signature && <img src={images.signature} alt="Signature" className="relative max-h-20 max-w-40 object-contain" />}
              {!images.stamp && !images.signature && <span className="mt-auto w-full border-b border-slate-300" aria-hidden />}
            </div>
            <p className="mt-1 font-semibold text-slate-900">{data.signatoryName || "Signature et cachet"}</p>
          </div>
        </div>

        {(data.footerNote || data.isDemo) && (
          <footer className="space-y-1 border-t border-slate-200 pt-3 break-inside-avoid text-[0.7rem] text-slate-500 sm:text-xs">
            {data.footerNote && <p className="whitespace-pre-line">{data.footerNote}</p>}
            {data.isDemo && <p className="font-semibold text-orange-800">Document de démonstration : données fictives, sans valeur.</p>}
          </footer>
        )}
      </div>
    </article>
  );
}

function Party({ title, party }: { title: string; party: InvoiceParty }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-500">{title}</p>
      <p className="font-semibold break-words text-slate-900">{party.name}</p>
      {party.lines.map((line, index) => (
        <p key={index} className="break-words text-slate-600">
          {line}
        </p>
      ))}
    </div>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-slate-700">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
