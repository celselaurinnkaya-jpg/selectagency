"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Hash, Plus, Send, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { SectionTitle } from "@/components/shared/ui";
import type { Invoice, InvoiceStatus } from "@/lib/domain/types";
import { CURRENCY_OPTIONS, formatMoney, minorUnits } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form-state";
import { parseAmount } from "@/features/finance/payments";
import { saveInvoiceAction } from "./actions";
import type { InvoiceDocumentData, InvoiceImages, InvoiceParty } from "./document";
import { InvoiceDocument } from "./InvoiceDocument";
import { lineAmount, parseTaxRate } from "./totals";

interface Line {
  key: number;
  label: string;
  quantity: string;
  unitAmount: string;
  taxRate: string;
}

export interface InvoiceEditorProps {
  invoice?: Pick<Invoice, "id" | "number" | "status" | "items" | "discountLabel" | "discountMinor" | "notes">;
  clients: { id: string; label: string; party: InvoiceParty }[];
  cases: { id: string; clientId: string; label: string; currency: string }[];
  defaults: { clientId: string; caseId: string; currency: string; issueDate: string; dueDate: string; paymentDetails: string };
  issuer: InvoiceParty;
  images: InvoiceImages;
  footerNote?: string;
  signatoryName?: string;
  isDemo: boolean;
  /** Services actifs de l'agence : un choix remplit une ligne (nom et tarif indicatif). */
  services?: { id: string; name: string; priceMinor?: number; currency?: string }[];
}

const emptyLine = (key: number): Line => ({ key, label: "", quantity: "1", unitAmount: "", taxRate: "0" });

/** Montant en unités mineures → saisie (« 150000 », « 12,50 »). */
const amountInput = (minor: number, currency: string) => {
  const digits = minorUnits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits).replace(".", ",");
};

/**
 * Next.js garde la page en mémoire entre deux visites : chaque « Nouvelle facture » doit ouvrir un
 * formulaire vierge (même principe que le formulaire de dossier).
 */
export function InvoiceEditor(props: InvoiceEditorProps) {
  const { bfcacheId } = useRouter();
  return <InvoiceEditorFields key={bfcacheId} {...props} />;
}

/**
 * Facture à gauche, aperçu fidèle à droite (en dessous sur téléphone), mis à jour à chaque frappe.
 * Champs contrôlés envoyés par onSubmit : rien n'est perdu si l'enregistrement est refusé.
 */
function InvoiceEditorFields({ invoice, clients, cases, defaults, issuer, images, footerNote, signatoryName, isDemo, services = [] }: InvoiceEditorProps) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const pending = saving || leaving;
  const [clientId, setClientId] = useState(defaults.clientId);
  const [caseId, setCaseId] = useState(defaults.caseId);
  const [currency, setCurrency] = useState(defaults.currency);
  const [issueDate, setIssueDate] = useState(defaults.issueDate);
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [lines, setLines] = useState<Line[]>(() =>
    invoice?.items.length
      ? invoice.items.map((item, index) => ({
          key: index + 1,
          label: item.label,
          quantity: String(item.quantity),
          unitAmount: amountInput(item.unitAmountMinor, defaults.currency),
          taxRate: String(item.taxRate).replace(".", ","),
        }))
      : [emptyLine(1)],
  );
  const [nextKey, setNextKey] = useState(() => (invoice?.items.length ?? 1) + 1);
  const [discountEnabled, setDiscountEnabled] = useState(Boolean(invoice?.discountMinor));
  const [discountLabel, setDiscountLabel] = useState(invoice?.discountLabel ?? "");
  const [discountAmount, setDiscountAmount] = useState(invoice?.discountMinor ? amountInput(invoice.discountMinor, defaults.currency) : "");
  const [paymentDetails, setPaymentDetails] = useState(defaults.paymentDetails);
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [showPreview, setShowPreview] = useState(true);
  const [serviceNote, setServiceNote] = useState<string>();

  const e = state.fieldErrors ?? {};
  const update = (key: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const clientCases = cases.filter((c) => c.clientId === clientId);

  /** Remplit la première ligne vide (ou en ajoute une) avec le service choisi. */
  function addService(id: string) {
    const service = services.find((s) => s.id === id);
    if (!service) return;
    const samePrice = service.priceMinor && service.currency === currency;
    const filled = { label: service.name, quantity: "1", unitAmount: samePrice ? amountInput(service.priceMinor!, currency) : "", taxRate: "0" };
    const blank = lines.find((l) => !l.label.trim() && !l.unitAmount.trim());
    if (blank) update(blank.key, filled);
    else {
      setLines((all) => [...all, { key: nextKey, ...filled }]);
      setNextKey((k) => k + 1);
    }
    setServiceNote(
      service.priceMinor && !samePrice
        ? `Le tarif de « ${service.name} » est en ${service.currency} : saisissez son prix en ${currency}.`
        : service.priceMinor
          ? undefined
          : `« ${service.name} » n'a pas de tarif indicatif : saisissez son prix.`,
    );
  }
  const status: InvoiceStatus = invoice?.status ?? "draft";
  const parsedLines = lines.map((l) => ({
    label: l.label.trim(),
    quantity: Number.isInteger(Number(l.quantity)) ? Math.max(0, Number(l.quantity)) : 0,
    unitAmountMinor: parseAmount(l.unitAmount, currency) ?? 0,
    taxRate: parseTaxRate(l.taxRate) ?? 0,
  }));

  const preview: InvoiceDocumentData = {
    number: invoice?.number,
    status,
    overdue: false,
    issueDate,
    dueDate,
    currency,
    issuer,
    recipient: clients.find((c) => c.id === clientId)?.party ?? { name: "Client à choisir", lines: [] },
    caseLabel: cases.find((c) => c.id === caseId)?.label,
    items: parsedLines,
    discountLabel: discountEnabled ? discountLabel.trim() || undefined : undefined,
    discountMinor: discountEnabled ? (parseAmount(discountAmount, currency) ?? 0) : 0,
    notes: notes.trim() || undefined,
    paymentDetails: paymentDetails.trim() || undefined,
    footerNote,
    signatoryName,
    isDemo,
  };

  return (
    <div className={cn("grid items-start gap-6", showPreview && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
      <form
        noValidate
        className="space-y-6 rounded-2xl bg-surface p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const intent = submitter?.value === "issue" ? "issue" : invoice ? "save" : "draft";
          startTransition(async () => {
            const result = await saveInvoiceAction({
              invoiceId: invoice?.id ?? "",
              clientId,
              caseId,
              currency,
              issueDate,
              dueDate,
              discountEnabled,
              discountLabel,
              discountAmount,
              paymentDetails,
              notes,
              intent,
              items: lines.map(({ label, quantity, unitAmount, taxRate }) => ({ label, quantity, unitAmount, taxRate })),
            });
            // Chargement complet de la facture : une navigation interne vers sa page, déjà gardée en
            // mémoire par Next 16.4, restait bloquée sur le squelette de chargement (constaté au test).
            if (result.ok && result.redirectTo) {
              setLeaving(true);
              window.location.assign(result.redirectTo);
            } else setState(result);
          });
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle as="h2">Informations de la facture</SectionTitle>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
            <Eye className="size-4 text-navy-700" aria-hidden />
            Afficher l&apos;aperçu
            <input type="checkbox" checked={showPreview} onChange={(event) => setShowPreview(event.target.checked)} className="peer sr-only" />
            <span aria-hidden className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-navy-800 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
          </label>
        </div>

        <div className="grid gap-4 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)] sm:grid-cols-2">
          <FormField id="f-client" label="Facturée à (client)" required error={e.clientId}>
            <select
              id="f-client"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                if (!cases.some((c) => c.id === caseId && c.clientId === event.target.value)) setCaseId("");
              }}
              className={selectClass}
              {...describedBy("f-client", e.clientId)}
            >
              <option value="">Choisir un client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="f-case" label="Dossier lié" hint={clientId && clientCases.length === 0 ? "Ce client n'a aucun dossier." : undefined}>
            <select
              id="f-case"
              value={caseId}
              disabled={!clientId || clientCases.length === 0}
              onChange={(event) => {
                setCaseId(event.target.value);
                const picked = cases.find((c) => c.id === event.target.value);
                if (picked) setCurrency(picked.currency);
              }}
              className={selectClass}
              {...describedBy("f-case", undefined, clientId && clientCases.length === 0 ? "hint" : undefined)}
            >
              <option value="">Aucun</option>
              {clientCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="f-issue" label="Date d'émission" required error={e.issueDate}>
            <Input id="f-issue" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} {...describedBy("f-issue", e.issueDate)} />
          </FormField>
          <FormField id="f-due" label="Date d'échéance" required error={e.dueDate}>
            <Input id="f-due" type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} {...describedBy("f-due", e.dueDate)} />
          </FormField>
          <FormField id="f-number" label="N° de facture" hint={invoice ? undefined : "Attribué automatiquement à l'enregistrement, sans trou."}>
            <div className="relative">
              <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input id="f-number" readOnly value={invoice?.number ?? `FAC-${issueDate.slice(0, 4)}-…`} className="bg-slate-50 pl-9 font-mono text-slate-600" {...describedBy("f-number", undefined, invoice ? undefined : "hint")} />
            </div>
          </FormField>
          <FormField id="f-currency" label="Devise" required>
            <select id="f-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className={selectClass}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="space-y-3">
          <SectionTitle as="h2">Prestations</SectionTitle>
          <ul className="space-y-3">
            {lines.map((line, index) => (
              <li key={line.key} className="space-y-3 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-navy-800">Ligne {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer la ligne ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <FormField id={`f-label-${line.key}`} label="Désignation" required>
                  <Input id={`f-label-${line.key}`} value={line.label} maxLength={160} onChange={(event) => update(line.key, { label: event.target.value })} placeholder="Ex. : Accompagnement Campus France" />
                </FormField>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <FormField id={`f-qty-${line.key}`} label="Qté" required>
                    <Input id={`f-qty-${line.key}`} type="number" min={1} max={9999} inputMode="numeric" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} className="tabular-nums" />
                  </FormField>
                  <FormField id={`f-tax-${line.key}`} label="Taxe (%)" required>
                    <Input id={`f-tax-${line.key}`} inputMode="decimal" value={line.taxRate} onChange={(event) => update(line.key, { taxRate: event.target.value })} className="tabular-nums" />
                  </FormField>
                  <FormField id={`f-unit-${line.key}`} label={`Prix unitaire (${currency})`} required className="col-span-2">
                    <Input id={`f-unit-${line.key}`} inputMode="decimal" value={line.unitAmount} onChange={(event) => update(line.key, { unitAmount: event.target.value })} className="tabular-nums" />
                  </FormField>
                </div>
                <p className="text-right text-sm text-slate-600">
                  Montant : <strong className="tabular-nums text-slate-900">{formatMoney(lineAmount(parsedLines[index]!), currency)}</strong>
                </p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={lines.length >= 50}
            onClick={() => {
              setLines((all) => [...all, emptyLine(nextKey)]);
              setNextKey((k) => k + 1);
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-sm font-medium text-navy-800 transition hover:ring-2 hover:ring-navy-200 disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden />
            Ajouter une ligne
          </button>
          {services.length > 0 && (
            <FormField id="f-service" label="Ajouter un service de l'agence" hint={serviceNote ?? "Remplit une ligne avec le nom du service et son tarif indicatif."}>
              <select
                id="f-service"
                value=""
                disabled={lines.length >= 50}
                onChange={(event) => addService(event.target.value)}
                className={selectClass}
                {...describedBy("f-service", undefined, "hint")}
              >
                <option value="">Choisir un service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.priceMinor && s.currency ? ` — ${formatMoney(s.priceMinor, s.currency)}` : ""}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </div>

        <div className="space-y-3 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
          <label className="flex min-h-10 items-center gap-3 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={discountEnabled} onChange={(event) => setDiscountEnabled(event.target.checked)} className="size-5 accent-navy-800" />
            Ajouter une remise
          </label>
          {discountEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="f-discount-label" label="Motif de la remise">
                <Input id="f-discount-label" value={discountLabel} maxLength={80} onChange={(event) => setDiscountLabel(event.target.value)} placeholder="Ex. : Remise fidélité" />
              </FormField>
              <FormField id="f-discount" label={`Montant (${currency})`} required error={e.discountAmount} hint="Déduit du total, taxes comprises.">
                <Input id="f-discount" inputMode="decimal" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} className="tabular-nums" {...describedBy("f-discount", e.discountAmount, "hint")} />
              </FormField>
            </div>
          )}
        </div>

        <div className="grid gap-4 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
          <FormField id="f-payment" label="Mode de paiement" hint="Banque, Mobile Money… Prérempli depuis Paramètres > Factures.">
            <Textarea id="f-payment" rows={3} maxLength={500} value={paymentDetails} onChange={(event) => setPaymentDetails(event.target.value)} {...describedBy("f-payment", undefined, "hint")} />
          </FormField>
          <FormField id="f-notes" label="Remarque imprimée sur la facture">
            <Textarea id="f-notes" rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex. : Acompte de 50 % à la signature, solde avant le dépôt du dossier." />
          </FormField>
        </div>

        <div className="space-y-3">
          <FormMessage message={state.ok ? undefined : state.message} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {status === "draft" && (
              <Button type="submit" value="draft" variant="outline" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer en brouillon"}
              </Button>
            )}
            {status === "draft" ? (
              <Button type="submit" value="issue" variant="accent" disabled={pending}>
                <Send aria-hidden />
                Émettre la facture
              </Button>
            ) : (
              <Button type="submit" value="save" variant="accent" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer les modifications"}
              </Button>
            )}
          </div>
          {status === "draft" && (
            <p className="text-xs text-slate-500 sm:text-right">
              Un brouillon porte la mention « BROUILLON ». Émettez la facture quand elle est prête à être remise au client.
            </p>
          )}
        </div>
      </form>

      {showPreview && (
        <aside aria-label="Aperçu de la facture" className="space-y-3 xl:sticky xl:top-20">
          <div className="flex items-center justify-between">
            <SectionTitle as="h2">Aperçu</SectionTitle>
            <span className="text-xs text-slate-500">Mis à jour pendant la saisie</span>
          </div>
          <InvoiceDocument data={preview} images={images} />
        </aside>
      )}
    </div>
  );
}
