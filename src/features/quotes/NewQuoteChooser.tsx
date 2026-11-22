"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, selectClass } from "@/components/shared/form";

// Un devis se prépare dans un dossier (il devient les prestations du dossier une fois accepté) :
// on choisit le dossier, puis on arrive directement sur le formulaire du devis.

export function NewQuoteChooser({ cases }: { cases: { id: string; label: string }[] }) {
  const [caseId, setCaseId] = useState("");
  if (cases.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Aucun dossier en cours : <Link href="/cases/new" className="font-medium text-navy-700 hover:underline">ouvrez d&apos;abord un dossier</Link> pour le client, puis
        préparez son devis.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FormField id="quote-case" label="Dossier du client" required className="min-w-0 flex-1">
        <select id="quote-case" value={caseId} onChange={(event) => setCaseId(event.target.value)} className={selectClass}>
          <option value="">— Choisir le dossier —</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </FormField>
      {caseId ? (
        <Button asChild variant="accent" className="h-11">
          <Link href={`/cases/${caseId}?tab=finance#devis`}>
            <Plus aria-hidden />
            Préparer le devis
          </Link>
        </Button>
      ) : (
        <Button type="button" variant="accent" className="h-11" disabled>
          <Plus aria-hidden />
          Préparer le devis
        </Button>
      )}
    </div>
  );
}
