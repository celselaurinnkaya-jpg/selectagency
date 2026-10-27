"use client";

import React, { useState } from "react";
import {
  Settings,
  Building2,
  Coins,
  Globe,
  Receipt,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { mockCurrentUser } from "@/lib/mockData";

export default function SettingsPage() {
  const [agencyName, setAgencyName] = useState(mockCurrentUser.agencyName);
  const [currency, setCurrency] = useState("XAF");
  const [timezone, setTimezone] = useState("Africa/Douala");
  const [receiptPrefix, setReceiptPrefix] = useState("REC");
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="pb-2 border-b border-slate-200">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Paramètres de l'agence
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configuration générale, devise par défaut, modèles de reçus et localisation.
          </p>
        </div>

        {saved && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Paramètres enregistrés avec succès.</span>
          </div>
        )}

        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-6">
          {/* Identity */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#023764]" />
              Identité de l'agence
            </h2>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Raison sociale de l'agence
              </label>
              <input
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              />
            </div>
          </div>

          {/* Localization & Currency */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-[#023764]" />
              Devise de facturation & Fuseau horaire
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Devise par défaut de l'agence
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                >
                  <option value="XAF">XAF — Franc CFA BEAC (0 décimale)</option>
                  <option value="XOF">XOF — Franc CFA BCEAO (0 décimale)</option>
                  <option value="CDF">CDF — Franc Congolais</option>
                  <option value="USD">USD — Dollar américain</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fuseau horaire
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
                >
                  <option value="Africa/Douala">Africa/Douala (UTC+1)</option>
                  <option value="Africa/Abidjan">Africa/Abidjan (UTC+0)</option>
                  <option value="Africa/Dakar">Africa/Dakar (UTC+0)</option>
                  <option value="Africa/Kinshasa">Africa/Kinshasa (UTC+1)</option>
                  <option value="Africa/Lubumbashi">Africa/Lubumbashi (UTC+2)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Receipts configuration */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-[#023764]" />
              Numérotation des reçus de caisse
            </h2>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Préfixe séquentiel des reçus
              </label>
              <input
                type="text"
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value)}
                className="w-48 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764] font-mono font-bold"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Exemple généré : {receiptPrefix}-2026-00042 (incrémentation sans trou garantie par verrou transactionnel)
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
