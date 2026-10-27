"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Eye,
  FileCheck,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/shared/StatusBadge";

export default function DocumentsPage() {
  const [filter, setFilter] = useState<"all" | "to_verify" | "missing" | "expiring">("to_verify");

  const docs = [
    {
      id: "doc-1",
      title: "Attestation de Virement Irrévocable (AVI)",
      clientName: "Arnaud Tchouameni",
      caseRef: "DOS-2026-00117",
      category: "Financier",
      status: "to_verify",
      statusLabel: "À vérifier",
      date: "Aujourd'hui à 09:30",
      filename: "avi_banque_douala.pdf",
    },
    {
      id: "doc-2",
      title: "Relevé bancaire du garant (3 derniers mois)",
      clientName: "Koffi Mensah",
      caseRef: "DOS-2026-00119",
      category: "Financier",
      status: "missing",
      statusLabel: "Manquant",
      date: "Échéance 30/10/2026",
      filename: null,
    },
    {
      id: "doc-3",
      title: "Passeport biométrique (Expiration dans 75 jours)",
      clientName: "Marie-Louise Banyingela",
      caseRef: "DOS-2026-00120",
      category: "Identité",
      status: "expiring",
      statusLabel: "Expire bientôt",
      date: "Expire le 12/01/2027",
      filename: "passeport_ml_scan.pdf",
    },
    {
      id: "doc-4",
      title: "Attestation d'hébergement ou bail locatif à Lyon",
      clientName: "Arnaud Tchouameni",
      caseRef: "DOS-2026-00117",
      category: "Logement",
      status: "missing",
      statusLabel: "Manquant",
      date: "Échéance 28/10/2026",
      filename: null,
    },
  ];

  const filteredDocs = docs.filter((d) => {
    if (filter === "all") return true;
    return d.status === filter;
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Gestion des documents & justificatifs
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Contrôle transversal des pièces justificatives, alertes d'expiration et vérifications agence.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              1 document à vérifier
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              2 pièces manquantes
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white p-2 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "all" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Tous les documents
          </button>
          <button
            type="button"
            onClick={() => setFilter("to_verify")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "to_verify" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            À vérifier par l'agence
          </button>
          <button
            type="button"
            onClick={() => setFilter("missing")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "missing" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Pièces manquantes (Non reçues)
          </button>
          <button
            type="button"
            onClick={() => setFilter("expiring")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "expiring" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Alertes d'expiration passeports
          </button>
        </div>

        {/* Documents Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Document / Intitulé</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Dossier</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Date / Échéance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#023764] shrink-0" />
                        <div>
                          <span>{doc.title}</span>
                          {doc.filename && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {doc.filename}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {doc.clientName}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-600">
                      <Link href={`/cases/case-1`} className="hover:underline hover:text-[#023764]">
                        {doc.caseRef}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4">
                      {doc.status === "to_verify" && (
                        <StatusBadge label="À vérifier" variant="amber" />
                      )}
                      {doc.status === "missing" && (
                        <StatusBadge label="Non reçu" variant="orange" />
                      )}
                      {doc.status === "expiring" && (
                        <StatusBadge label="Expire bientôt" variant="rose" />
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium">
                      {doc.date}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {doc.status === "to_verify" ? (
                        <button
                          type="button"
                          onClick={() => alert("Document validé avec succès")}
                          className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors"
                        >
                          Valider
                        </button>
                      ) : (
                        <Link
                          href={`/cases/case-1`}
                          className="px-2.5 py-1 text-xs font-semibold text-[#023764] bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                        >
                          Voir dossier
                        </Link>
                      )}
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
