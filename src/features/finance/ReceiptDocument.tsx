/* eslint-disable @next/next/no-img-element -- images privées servies par l'application, déjà dimensionnées */
import { cn } from "cn";
import { formatMoney, initials } from "@/lib/format";
import type { InvoiceImages, InvoiceParty } from "@/features/invoices/document";
import { RECEIPT_MENTION, type ReceiptDocumentData } from "./receipt";

// Reçu tel qu'il est remis au client : page imprimable (le PDF reprend la même mise en page, A4).
// Même présentation que la facture : logo, cachet et signature de Paramètres > Factures.

export function ReceiptDocument({ data, images, className }: { data: ReceiptDocumentData; images: InvoiceImages; className?: string }) {
  const money = (amount: number) => formatMoney(amount, data.currency);
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl bg-white text-slate-800 shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-slate-200 [print-color-adjust:exact] print:rounded-none print:shadow-none print:ring-0",
        className,
      )}
    >
      {data.voided && (
        <p aria-hidden className="pointer-events-none absolute inset-0 flex -rotate-[30deg] items-center justify-center text-6xl font-bold tracking-widest text-red-100 select-none sm:text-8xl">
          ANNULÉ
        </p>
      )}
      <div className="relative space-y-6 p-5 sm:p-8 print:space-y-4 print:p-0">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">REÇU DE PAIEMENT</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              N° de reçu
              <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-xs text-slate-800">{data.number}</span>
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
          <Party title="Délivré par" party={data.issuer} />
          <Party title="Reçu de" party={data.recipient} />
          <div>
            <p className="text-slate-500">Date du paiement</p>
            <p className="font-semibold text-slate-900">{data.paidAtLabel}</p>
          </div>
          <div className="min-w-0">
            <p className="text-slate-500">Moyen de paiement</p>
            <p className="font-semibold break-words text-slate-900">{data.method}</p>
          </div>
          {data.payerName && (
            <div className="min-w-0">
              <p className="text-slate-500">Payé par</p>
              <p className="font-semibold break-words text-slate-900">{data.payerName}</p>
            </div>
          )}
          <p className="col-span-2 text-slate-600">Dossier : {data.caseLabel}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-600 sm:text-sm">Affectation du paiement</p>
          {/* Téléphone : une ligne par prestation (le tableau ne tient pas en largeur). */}
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-xs sm:hidden print:hidden">
            {data.lines.map((line, index) => (
              <li key={index} className="flex justify-between gap-3 py-2 break-inside-avoid">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{line.label}</span>
                  <span className="block text-slate-600">{line.nature}</span>
                </span>
                <span className="font-medium whitespace-nowrap tabular-nums text-slate-900">{money(line.amountMinor)}</span>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-xs sm:table sm:text-sm print:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th scope="col" className="py-2 pr-2 font-medium">Prestation</th>
                <th scope="col" className="px-2 py-2 font-medium">Nature</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.lines.map((line, index) => (
                <tr key={index} className="align-top break-inside-avoid">
                  <td className="py-2 pr-2 text-slate-900">{line.label}</td>
                  <td className="px-2 py-2 text-slate-600">{line.nature}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums text-slate-900">{money(line.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end break-inside-avoid">
          <dl className="w-full max-w-xs space-y-1.5 rounded-lg bg-surface p-3 text-sm sm:max-w-sm">
            <div className="flex justify-between gap-3 font-bold text-navy-800 sm:text-base">
              <dt>Total reçu</dt>
              <dd className="tabular-nums">{money(data.amountMinor)}</dd>
            </div>
            {data.balanceAfterMinor !== undefined && (
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 text-slate-700">
                <dt>Reste à payer sur le dossier</dt>
                <dd className={data.balanceAfterMinor === 0 ? "font-semibold text-emerald-800" : "font-semibold tabular-nums"}>
                  {data.balanceAfterMinor === 0 ? "Soldé" : money(data.balanceAfterMinor)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {data.voided && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-red-800">
            <p className="font-semibold">REÇU ANNULÉ</p>
            <p className="text-xs sm:text-sm">
              {data.voided.label}
              {data.voided.reason && ` · motif : ${data.voided.reason}`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 items-end gap-4 border-t border-slate-200 pt-5 text-xs break-inside-avoid sm:text-sm print:pt-3">
          <div>
            <p className="text-slate-500">Reçu par</p>
            <p className="font-semibold text-slate-900">{data.receivedBy ?? "—"}</p>
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

        <footer className="space-y-1 border-t border-slate-200 pt-3 text-[0.7rem] text-slate-500 sm:text-xs">
          <p>{RECEIPT_MENTION}</p>
          {data.footerNote && <p className="whitespace-pre-line">{data.footerNote}</p>}
          {data.isDemo && <p className="font-semibold text-orange-800">Document de démonstration : données fictives, sans valeur.</p>}
        </footer>
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
