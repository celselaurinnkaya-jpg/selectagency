"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Receipt,
  Plus,
  ArrowLeft,
  Building,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { formatMoney } from "@/lib/mockData";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([
    {
      id: "exp-1",
      category: "Frais consulaires (débours pour compte tiers)",
      supplier: "Centre VFS Global Bonanjo",
      amountMinor: 185000,
      currency: "XAF",
      caseRef: "DOS-2026-00117",
      date: "19/09/2026",
      paidBy: "Marcelle Eboa",
    },
    {
      id: "exp-2",
      category: "Fonctionnement agence",
      supplier: "Eneo Cameroun (Électricité bureau)",
      amountMinor: 65000,
      currency: "XAF",
      caseRef: "Général",
      date: "05/10/2026",
      paidBy: "Celse Laurin Nkaya",
    },
    {
      id: "exp-3",
      category: "Abonnement télécoms & Internet",
      supplier: "Camtel Fibre",
      amountMinor: 50000,
      currency: "XAF",
      caseRef: "Général",
      date: "01/10/2026",
      paidBy: "Celse Laurin Nkaya",
    },
  ]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Dépenses & Déboursiers
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Frais de fonctionnement et débours reversés pour le compte des clients.
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("Simulation d'enregistrement d'une dépense")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Enregistrer une dépense</span>
          </button>
        </div>

        {/* Expenses Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Type de dépense</th>
                  <th className="py-3 px-4">Bénéficiaire / Fournisseur</th>
                  <th className="py-3 px-4">Dossier imputé</th>
                  <th className="py-3 px-4">Montant déboursé</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Enregistré par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {e.category}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {e.supplier}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-600">
                      {e.caseRef}
                    </td>
                    <td className="py-3.5 px-4 font-black text-rose-600 text-sm">
                      {formatMoney(e.amountMinor, e.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium">
                      {e.date}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {e.paidBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
