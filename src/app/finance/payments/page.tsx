"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Plus,
  Search,
  Download,
  Receipt,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Building,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { formatMoney, mockCurrentUser } from "@/lib/mockData";

export default function FinancePaymentsPage() {
  const [payments, setPayments] = useState([
    {
      id: "pay-1",
      receiptNumber: "REC-2026-00088",
      clientName: "Arnaud Tchouameni",
      caseRef: "DOS-2026-00117",
      amountMinor: 850000,
      currency: "XAF",
      method: "Orange Money",
      transactionRef: "OM-CM-9823419",
      date: "18/09/2026 à 14:22",
      receivedBy: "Celse Laurin Nkaya",
      status: "recorded",
    },
    {
      id: "pay-2",
      receiptNumber: "REC-2026-00089",
      clientName: "Aminata Diallo",
      caseRef: "DOS-2026-00118",
      amountMinor: 450000,
      currency: "XAF",
      method: "Virement bancaire (UBA)",
      transactionRef: "VIR-UBA-4482",
      date: "10/10/2026 à 11:05",
      receivedBy: "Marcelle Eboa",
      status: "recorded",
    },
    {
      id: "pay-3",
      receiptNumber: "REC-2026-00090",
      clientName: "Marie-Louise Banyingela",
      caseRef: "DOS-2026-00120",
      amountMinor: 200000,
      currency: "XAF",
      method: "Espèces (Caisse agence)",
      transactionRef: "CSH-BONANJO-11",
      date: "15/10/2026 à 16:40",
      receivedBy: "Marcelle Eboa",
      status: "recorded",
    },
    {
      id: "pay-4",
      receiptNumber: "REC-2026-00091",
      clientName: "Koffi Mensah",
      caseRef: "DOS-2026-00119",
      amountMinor: 900000,
      currency: "XAF",
      method: "MTN Mobile Money",
      transactionRef: "MOMO-9923841",
      date: "03/10/2026 à 10:15",
      receivedBy: "Jean-Paul Kamga",
      status: "recorded",
    },
  ]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Paiements & Reçus officiels
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Journal des encaissements certifiés par reçu séquentiel (REC-2026-...).
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("Simulation d'enregistrement d'un paiement")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Enregistrer un encaissement</span>
          </button>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Numéro de reçu</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Dossier lié</th>
                  <th className="py-3 px-4">Montant encaissé</th>
                  <th className="py-3 px-4">Moyen de règlement</th>
                  <th className="py-3 px-4">Date de paiement</th>
                  <th className="py-3 px-4">Encaissé par</th>
                  <th className="py-3 px-4 text-right">Reçu PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {p.receiptNumber}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {p.clientName}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-600">
                      <Link href={`/cases/case-1`} className="hover:underline hover:text-[#023764]">
                        {p.caseRef}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-700 text-sm">
                      {formatMoney(p.amountMinor, p.currency)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-700">{p.method}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        Réf : {p.transactionRef}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium">
                      {p.date}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.receivedBy}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => alert(`Téléchargement du reçu ${p.receiptNumber}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#023764] bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger</span>
                      </button>
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
