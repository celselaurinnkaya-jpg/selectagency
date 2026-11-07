"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/shared/form";
import { formatDate } from "@/lib/format";
import { convert, currencyOptions, isFixedPair, roundFor, type EuroRates } from "./currency-converter";
import { formatNumber } from "./pocket-calculator";

// Convertisseur de devises de la calculatrice. Les cours viennent de la BCE (page serveur) ; l'euro et le franc
// CFA restent disponibles même sans eux, grâce à leur parité fixe.

const parse = (value: string) => {
  const n = Number(value.replace(/[\s  ]/g, "").replace(",", "."));
  return value.trim() && Number.isFinite(n) ? n : undefined;
};

export function CurrencyConverter({
  rates,
  ratesDate,
  defaultTo,
}: {
  /** Unités de chaque devise pour 1 euro. */
  rates: EuroRates["rates"];
  /** Date de publication des cours de la BCE ; absente si seuls l'euro et le franc CFA sont disponibles. */
  ratesDate?: string;
  /** Devise de l'agence, proposée par défaut à l'arrivée. */
  defaultTo: string;
}) {
  const options = currencyOptions(rates);
  const has = (code: string) => code in rates;
  const initialTo = has(defaultTo) ? defaultTo : "XAF";
  const [from, setFrom] = useState(initialTo === "EUR" ? "USD" : "EUR");
  const [to, setTo] = useState(initialTo);
  // Le montant saisi et le côté où il a été saisi ; l'autre côté est calculé.
  const [typed, setTyped] = useState("");
  const [side, setSide] = useState<"from" | "to">("from");

  const amount = parse(typed);
  const other = (() => {
    if (amount === undefined) return "";
    const result = side === "from" ? convert(amount, from, to, rates) : convert(amount, to, from, rates);
    return result === undefined ? "" : formatNumber(roundFor(result, side === "from" ? to : from));
  })();
  const fromValue = side === "from" ? typed : other;
  const toValue = side === "to" ? typed : other;

  const unit = convert(1, from, to, rates);
  const fixed = isFixedPair(from, to);

  function swap() {
    setFrom(to);
    setTo(from);
    // Le montant saisi suit sa devise.
    setSide((s) => (s === "from" ? "to" : "from"));
  }

  const row = (id: string, label: string, value: string, currency: string, onAmount: (v: string) => void, onCurrency: (c: string) => void) => (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-montant`} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <div className="flex gap-2">
        <Input id={`${id}-montant`} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onAmount(e.target.value)} placeholder="0" className="min-w-0 flex-1 tabular-nums" />
        <label htmlFor={`${id}-devise`} className="sr-only">
          Devise ({label.toLowerCase()})
        </label>
        <select id={`${id}-devise`} value={currency} onChange={(e) => onCurrency(e.target.value)} className={`${selectClass} w-28 shrink-0 sm:w-44`}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="conversion-devises" className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
      <h3 id="conversion-devises" className="font-semibold text-navy-800">
        Conversion de devises
      </h3>
      <div className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {row(
          "conversion-de",
          "De",
          fromValue,
          from,
          (v) => {
            setTyped(v);
            setSide("from");
          },
          setFrom,
        )}
        <button
          type="button"
          onClick={swap}
          aria-label="Inverser les deux devises"
          title="Inverser les deux devises"
          className="mx-auto flex size-10 items-center justify-center rounded-lg border border-navy-200 bg-navy-50 text-navy-800 transition hover:bg-navy-100"
        >
          <ArrowLeftRight className="size-4" aria-hidden />
        </button>
        {row(
          "conversion-vers",
          "Vers",
          toValue,
          to,
          (v) => {
            setTyped(v);
            setSide("to");
          },
          setTo,
        )}
      </div>
      {unit !== undefined && from !== to && (
        <p className="mt-3 text-sm font-medium text-slate-800 tabular-nums">
          1 {from} = {formatNumber(Number(unit.toPrecision(6)))} {to} · 1 {to} = {formatNumber(Number((1 / unit).toPrecision(6)))} {from}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        {fixed
          ? "Parité fixe entre l'euro et le franc CFA : 1 € = 655,957 FCFA (XAF et XOF)."
          : ratesDate
            ? `Taux de référence de la Banque centrale européenne du ${formatDate(`${ratesDate}T12:00:00Z`, "UTC")}, à titre indicatif : votre banque ou votre bureau de change applique son propre taux et ses frais.`
            : ""}
      </p>
      {!ratesDate && (
        <p className="mt-2 text-xs text-orange-800">
          Les cours des autres devises sont indisponibles pour le moment : seuls l&apos;euro et le franc CFA (parité fixe) sont proposés.
        </p>
      )}
    </section>
  );
}
