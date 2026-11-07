"use client";

import { useRef, useState } from "react";
import { Copy, Delete, History } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyConverter } from "./CurrencyConverter";
import type { EuroRates } from "./currency-converter";
import { evaluate, formatNumber } from "./pocket-calculator";

// Calculatrice de la page Finance. Tout se calcule dans le navigateur : rien n'est enregistré dans l'agence.

type Key = { label: string; insert?: string; action?: "clear" | "back" | "equals"; tone?: "op" | "accent" | "muted"; aria?: string };

const KEYS: Key[] = [
  { label: "C", action: "clear", tone: "muted", aria: "Tout effacer" },
  { label: "(", insert: "(", tone: "muted" },
  { label: ")", insert: ")", tone: "muted" },
  { label: "÷", insert: "÷", tone: "op", aria: "Diviser" },
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "×", insert: "×", tone: "op", aria: "Multiplier" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: "−", insert: "−", tone: "op", aria: "Soustraire" },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "+", insert: "+", tone: "op", aria: "Additionner" },
  { label: "0", insert: "0" },
  { label: "000", insert: "000", aria: "Trois zéros" },
  { label: ",", insert: ",", aria: "Virgule" },
  { label: "%", insert: "%", tone: "op", aria: "Pour cent" },
];

interface Line {
  expression: string;
  result: number;
}

export function Calculator({ rates, ratesDate, defaultCurrency }: { rates: EuroRates["rates"]; ratesDate?: string; defaultCurrency: string }) {
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState<Line[]>([]);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = expression.trim() ? evaluate(expression) : undefined;

  function insert(text: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expression.length;
    const end = el?.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + text + expression.slice(end);
    setExpression(next);
    setError(undefined);
    setCopied(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function equals() {
    const result = evaluate(expression);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHistory((h) => [{ expression: expression.trim(), result: result.value }, ...h].slice(0, 12));
    setExpression(String(result.value).replace(".", ","));
    setError(undefined);
    setCopied(false);
  }

  function press(key: Key) {
    if (key.action === "clear") {
      setExpression("");
      setError(undefined);
      inputRef.current?.focus();
    } else if (key.action === "back") {
      setExpression((e) => e.slice(0, -1));
    } else if (key.action === "equals") {
      equals();
    } else if (key.insert) {
      insert(key.insert);
    }
  }

  async function copy() {
    if (!preview?.ok) return;
    try {
      await navigator.clipboard.writeText(String(preview.value).replace(".", ","));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="rounded-2xl bg-navy-900 p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
        <label htmlFor="calcul" className="sr-only">
          Calcul
        </label>
        <Input
          ref={inputRef}
          id="calcul"
          inputMode="decimal"
          autoComplete="off"
          value={expression}
          onChange={(e) => {
            setExpression(e.target.value);
            setError(undefined);
            setCopied(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "=") {
              e.preventDefault();
              equals();
            } else if (e.key === "Escape") {
              setExpression("");
              setError(undefined);
            }
          }}
          placeholder="Ex. : 150 000 + 10 %"
          aria-describedby="calcul-resultat"
          className="h-12 border-white/15 bg-white/10 text-right font-mono text-lg text-white tabular-nums placeholder:text-navy-200 focus-visible:border-citron-400"
        />
        <p id="calcul-resultat" aria-live="polite" className="mt-2 min-h-9 text-right text-3xl font-semibold text-citron-400 tabular-nums">
          {preview?.ok ? formatNumber(preview.value) : expression.trim() ? "…" : "0"}
        </p>
        {error && (
          <p role="alert" className="mb-2 text-right text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="mt-2 grid grid-cols-4 gap-2">
          {KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              aria-label={key.aria}
              onClick={() => press(key)}
              className={cn(
                "h-12 rounded-lg text-lg font-semibold tabular-nums transition focus-visible:ring-2 focus-visible:ring-citron-400 focus-visible:outline-none",
                key.tone === "op"
                  ? "bg-navy-600 text-citron-400 hover:bg-navy-500"
                  : key.tone === "muted"
                    ? "bg-navy-700 text-white hover:bg-navy-600"
                    : "bg-white/10 text-white hover:bg-white/20",
              )}
            >
              {key.label}
            </button>
          ))}
          <button
            type="button"
            aria-label="Effacer le dernier caractère"
            onClick={() => press({ label: "⌫", action: "back" })}
            className="flex h-12 items-center justify-center rounded-lg bg-navy-700 text-white transition hover:bg-navy-600 focus-visible:ring-2 focus-visible:ring-citron-400 focus-visible:outline-none"
          >
            <Delete className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={equals}
            className="col-span-3 h-12 rounded-lg border border-citron-500 bg-citron-400 text-lg font-semibold text-navy-900 transition hover:bg-citron-300 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            =
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-navy-100">
          <span>Clavier : chiffres, + − * / % ( ), Entrée pour calculer, Échap pour effacer.</span>
          <button
            type="button"
            onClick={copy}
            disabled={!preview?.ok}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 font-medium text-white hover:bg-white/10 disabled:opacity-40"
          >
            <Copy className="size-4" aria-hidden />
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <section aria-labelledby="historique-calculs" className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
          <h3 id="historique-calculs" className="flex items-center gap-2 font-semibold text-navy-800">
            <History className="size-4" aria-hidden />
            Derniers calculs
          </h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Vos calculs apparaîtront ici. Touchez-en un pour reprendre son résultat.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {history.map((line, i) => (
                <li key={`${i}-${line.expression}`}>
                  <button
                    type="button"
                    onClick={() => insert(String(line.result).replace(".", ","))}
                    className="flex min-h-11 w-full flex-wrap items-baseline justify-between gap-x-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-navy-50"
                  >
                    <span className="font-mono text-slate-600">{line.expression}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">= {formatNumber(line.result)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {history.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setHistory([])}>
              Effacer l&apos;historique
            </Button>
          )}
        </section>

        <CurrencyConverter rates={rates} ratesDate={ratesDate} defaultTo={defaultCurrency} />
      </div>
    </div>
  );
}
