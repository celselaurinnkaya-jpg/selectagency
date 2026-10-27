"use client";

import React from "react";
import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Receipt,
  Download,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { formatMoney, mockMetrics } from "@/lib/mockData";

export default function FinanceOverviewPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Rapports & Synthèse financière
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Rapports par devise de facturation (ADR 006 — aucune conversion fictive entre devises).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/finance/payments"
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs"
            >
              Voir tous les reçus émis
            </Link>
          </div>
        </div>

        {/* 3 Main Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Encaissé net (Période)
            </span>
            <span className="text-2xl font-black text-emerald-700 block mt-1">
              {formatMoney(mockMetrics.receivedPaymentsMinor, "XAF")}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Paiements clients validés et non annulés
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Soldes restant à recouvrer
            </span>
            <span className="text-2xl font-black text-rose-600 block mt-1">
              {formatMoney(mockMetrics.balanceDueMinor, "XAF")}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Dossiers actifs avec reste à payer
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Dépenses & Déboursiers
            </span>
            <span className="text-2xl font-black text-slate-800 block mt-1">
              {formatMoney(3200000, "XAF")}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Frais consulaires tiers et fonctionnement
            </p>
          </div>
        </div>

        {/* Legal Notice */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-bold text-slate-800">
            Mention de conformité de gestion interne :
          </p>
          <p>
            SELECT Agency émet des <strong>reçus internes de caisse</strong> attestant de la réception des fonds et de leur affectation aux prestations de mobilité. Les fonds destinés aux tiers (frais consulaires, universités) sont distingués des honoraires propres de l'agence.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
