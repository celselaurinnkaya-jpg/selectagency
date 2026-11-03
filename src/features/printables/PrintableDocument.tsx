/* eslint-disable @next/next/no-img-element -- images privées servies par l'application, déjà dimensionnées */
import { cn } from "cn";
import { initials } from "@/lib/format";
import type { InvoiceImages, InvoiceParty } from "@/features/invoices/document";
import { CHECKLIST_LABEL, type ChecklistState, type DocumentSpec, type SpecSection } from "./spec";

// Document imprimable (devis, récapitulatif, confirmation) : même présentation que la facture.
// À l'impression : marges du format A4, aucune ligne coupée entre deux pages.

const DOT: Record<ChecklistState, string> = {
  done: "border-emerald-600 bg-emerald-600",
  current: "border-navy-800 bg-white ring-2 ring-navy-200",
  todo: "border-slate-300 bg-white",
  skipped: "border-slate-300 bg-slate-200",
  warning: "border-orange-500 bg-orange-100",
};

export function PrintableDocument({ spec, images, className }: { spec: DocumentSpec; images: InvoiceImages; className?: string }) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl bg-white text-slate-800 shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-slate-200 [print-color-adjust:exact] print:overflow-visible print:rounded-none print:shadow-none print:ring-0",
        className,
      )}
    >
      {spec.watermark && (
        <p aria-hidden className="pointer-events-none absolute inset-0 flex -rotate-[30deg] items-center justify-center text-6xl font-bold tracking-widest text-red-100 select-none sm:text-8xl">
          {spec.watermark}
        </p>
      )}
      <div className="relative space-y-6 p-5 sm:p-8 print:space-y-4 print:p-0">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl print:text-2xl">{spec.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {spec.numberLabel}
              <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-xs text-slate-800">{spec.number}</span>
            </p>
          </div>
          {images.logo ? (
            <img src={images.logo} alt={`Logo de ${spec.issuer.name}`} className="max-h-16 max-w-32 object-contain sm:max-h-20 sm:max-w-44 print:max-h-16" />
          ) : (
            <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-navy-800 text-lg font-bold text-citron-400">
              {initials(spec.issuer.name)}
            </span>
          )}
        </header>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-200 pt-5 text-xs sm:text-sm print:gap-y-3 print:pt-4">
          <Party title={spec.issuerTitle} party={spec.issuer} />
          <Party title={spec.recipientTitle} party={spec.recipient} />
          {spec.facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <p className="text-slate-500">{fact.label}</p>
              <p className="font-semibold break-words text-slate-900">{fact.value}</p>
            </div>
          ))}
        </div>

        {spec.sections.map((section) => (
          <Section key={section.title} section={section} />
        ))}

        <div className="flex justify-end border-t border-slate-200 pt-5 text-xs break-inside-avoid sm:text-sm print:pt-3">
          <div className="flex flex-col items-end text-right">
            <div className="relative flex h-24 w-44 items-center justify-center print:h-20">
              {images.stamp && <img src={images.stamp} alt="Cachet de l'agence" className="absolute inset-0 m-auto max-h-24 max-w-28 object-contain opacity-90 print:max-h-20" />}
              {images.signature && <img src={images.signature} alt="Signature" className="relative max-h-20 max-w-40 object-contain print:max-h-16" />}
              {!images.stamp && !images.signature && <span className="mt-auto w-full border-b border-slate-300" aria-hidden />}
            </div>
            <p className="mt-1 font-semibold text-slate-900">{spec.signatoryName || "Signature et cachet"}</p>
          </div>
        </div>

        {(spec.footer.length > 0 || spec.isDemo) && (
          <footer className="space-y-1 border-t border-slate-200 pt-3 text-[0.7rem] text-slate-500 break-inside-avoid sm:text-xs">
            {spec.footer.map((line, index) => (
              <p key={index} className="whitespace-pre-line">
                {line}
              </p>
            ))}
            {spec.isDemo && <p className="font-semibold text-orange-800">Document de démonstration : données fictives, sans valeur.</p>}
          </footer>
        )}
      </div>
    </article>
  );
}

function Section({ section }: { section: SpecSection }) {
  const title = <p className="mb-2 text-xs font-medium text-slate-600 break-after-avoid sm:text-sm">{section.title}</p>;
  if (section.kind === "text") {
    return (
      <div className="break-inside-avoid">
        {title}
        <p className="rounded-md border border-slate-200 px-3 py-2 text-xs whitespace-pre-line text-slate-700 sm:text-sm">{section.text}</p>
      </div>
    );
  }
  if (section.kind === "amounts") {
    return (
      <div className="flex justify-end break-inside-avoid">
        <dl className="w-full max-w-xs space-y-1.5 rounded-lg bg-surface p-3 text-xs sm:max-w-sm sm:text-sm">
          <p className="font-medium text-slate-600">{section.title}</p>
          {section.rows.map((row) => (
            <div key={row.label} className={cn("flex justify-between gap-3", row.strong ? "border-t border-slate-200 pt-1.5 font-bold text-navy-800" : "text-slate-700")}>
              <dt>{row.label}</dt>
              <dd className="tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (section.kind === "checklist") {
    return (
      <div>
        {title}
        {section.items.length === 0 ? (
          <p className="text-xs text-slate-500 sm:text-sm">{section.empty ?? "Rien à signaler."}</p>
        ) : (
          // Liste longue (étapes, pièces) : deux colonnes, pour tenir sur une page A4.
          <ul className={cn("border-t border-slate-200 text-xs sm:text-sm", section.items.length > 6 ? "grid gap-x-6 sm:grid-cols-2 print:grid-cols-2" : "")}>
            {section.items.map((item, index) => (
              <li key={index} className="flex items-start gap-3 border-b border-slate-100 py-1.5 break-inside-avoid">
                <span aria-hidden className={cn("mt-1 size-3 shrink-0 rounded-full border-2", DOT[item.state])} />
                <span className={cn("min-w-0 flex-1", item.state === "current" ? "font-semibold text-slate-900" : "text-slate-800")}>{item.label}</span>
                <span className="shrink-0 text-right text-slate-500">
                  <span className="sr-only">{CHECKLIST_LABEL[item.state]} : </span>
                  {item.detail ?? CHECKLIST_LABEL[item.state]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div>
      {title}
      {section.rows.length === 0 ? (
        <p className="text-xs text-slate-500 sm:text-sm">{section.empty ?? "Aucune ligne."}</p>
      ) : (
        <>
          {/* Téléphone : une ligne par entrée (le tableau ne tient pas en largeur). */}
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-xs sm:hidden print:hidden">
            {section.rows.map((row, index) => (
              <li key={index} className="space-y-0.5 py-2">
                <p className="font-medium text-slate-900">{row[0]}</p>
                <p className="text-slate-600">
                  {row
                    .slice(1)
                    .map((cell, i) => `${section.columns[i + 1]!.label} : ${cell}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-xs sm:table sm:text-sm print:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                {section.columns.map((column) => (
                  <th key={column.label} scope="col" className={cn("px-1 py-2 font-medium first:pl-0 last:pr-0", column.align === "right" && "text-right")}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {section.rows.map((row, index) => (
                <tr key={index} className="align-top break-inside-avoid">
                  {row.map((cell, i) => (
                    <td key={i} className={cn("px-1 py-2 first:pl-0 last:pr-0", section.columns[i]?.align === "right" ? "text-right whitespace-nowrap tabular-nums" : "text-slate-900")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {section.total && (
        <div className="mt-3 flex justify-end break-inside-avoid">
          <dl className="flex w-full max-w-xs justify-between gap-3 rounded-lg bg-surface p-3 text-sm font-bold text-navy-800 sm:max-w-sm sm:text-base">
            <dt>{section.total.label}</dt>
            <dd className="tabular-nums">{section.total.value}</dd>
          </dl>
        </div>
      )}
    </div>
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
