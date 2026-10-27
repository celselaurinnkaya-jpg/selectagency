"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building,
  GraduationCap,
  Plane,
  Briefcase,
  User,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, BadgeVariant } from "@/components/shared/StatusBadge";
import { initialCases, formatMoney, TravelCase } from "@/lib/mockData";

function CasesPageContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams?.get("category") || "all";

  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [statusFilter, setStatusFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");

  const filteredCases = initialCases.filter((c) => {
    const matchesSearch =
      c.reference.toLowerCase().includes(search.toLowerCase()) ||
      c.clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.destinationCountry.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === "all" || c.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesDest = destinationFilter === "all" || c.destinationCountry === destinationFilter;

    return matchesSearch && matchesCategory && matchesStatus && matchesDest;
  });

  const getStatusVariant = (status: string, currentStep: string): { label: string; variant: BadgeVariant } => {
    if (status === "closed") {
      return { label: "Clôturé", variant: "emerald" };
    }
    if (currentStep.toLowerCase().includes("attente")) {
      return { label: currentStep, variant: "amber" };
    }
    if (currentStep.toLowerCase().includes("visa") || currentStep.toLowerCase().includes("dépôt")) {
      return { label: currentStep, variant: "purple" };
    }
    if (currentStep.toLowerCase().includes("pièces") || currentStep.toLowerCase().includes("constitution")) {
      return { label: currentStep, variant: "orange" };
    }
    return { label: currentStep, variant: "blue" };
  };

  // Kanban Columns Definition
  const kanbanColumns = [
    { id: "new", title: "Nouveaux dossiers", color: "border-sky-400 bg-sky-50/50" },
    { id: "docs", title: "Collecte & Vérification", color: "border-amber-400 bg-amber-50/50" },
    { id: "prep", title: "Dépôt & Préparation", color: "border-purple-400 bg-purple-50/50" },
    { id: "awaiting", title: "Attente Consulat / Univ.", color: "border-yellow-400 bg-yellow-50/50" },
    { id: "closed", title: "Terminés", color: "border-emerald-400 bg-emerald-50/50" },
  ];

  const getKanbanColumnForCase = (c: TravelCase) => {
    if (c.status === "closed") return "closed";
    if (c.currentStep.toLowerCase().includes("attente")) return "awaiting";
    if (c.currentStep.toLowerCase().includes("dépôt") || c.currentStep.toLowerCase().includes("visa")) return "prep";
    if (c.missingDocsCount > 0 || c.currentStep.toLowerCase().includes("pièces")) return "docs";
    return "new";
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Tous les dossiers
              </h1>
              <span className="px-2 py-0.5 text-xs font-bold bg-[#023764]/10 text-[#023764] rounded-full">
                {filteredCases.length} dossiers
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Suivi opérationnel des démarches d'études, visas et voyages de l'agence.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {/* View Switcher: Table vs Kanban */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-slate-600 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "table"
                    ? "bg-[#023764] text-white shadow-xs"
                    : "hover:text-slate-900"
                }`}
                title="Affichage en tableau"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "kanban"
                    ? "bg-[#023764] text-white shadow-xs"
                    : "hover:text-slate-900"
                }`}
                title="Affichage en vue Kanban"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            <Link
              href="/cases/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nouveau dossier</span>
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence DOS-..., client, destination..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-[#023764] rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#023764]/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Toutes les catégories</option>
              <option value="study_abroad">Études à l'étranger</option>
              <option value="tourist_visa">Visa touristique</option>
              <option value="business_travel">Voyage d'affaires</option>
              <option value="administrative_support">Accompagnement administratif</option>
            </select>

            <select
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Toutes les destinations</option>
              <option value="France">France</option>
              <option value="Canada">Canada</option>
              <option value="Belgique">Belgique</option>
              <option value="Émirats Arabes Unis">Émirats Arabes Unis</option>
              <option value="Chine">Chine</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="closed">Clôturé</option>
              <option value="on_hold">En pause</option>
            </select>
          </div>
        </div>

        {/* View Mode: Table */}
        {viewMode === "table" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Référence</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Projet & Catégorie</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Étape actuelle</th>
                    <th className="py-3 px-4">Conseiller</th>
                    <th className="py-3 px-4">Prochaine action & Échéance</th>
                    <th className="py-3 px-4">Solde dû</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCases.map((c) => {
                    const statusInfo = getStatusVariant(c.status, c.currentStep);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          <Link href={`/cases/${c.id}`} className="hover:text-[#023764] hover:underline">
                            {c.reference}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <Link href={`/clients/${c.clientId}`} className="hover:text-blue-700">
                            {c.clientName}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-800 line-clamp-1">{c.title}</p>
                          <span className="text-[11px] text-slate-400">{c.categoryLabel}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            <span>{c.destinationFlag}</span>
                            <span>{c.destinationCountry}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge label={statusInfo.label} variant={statusInfo.variant} />
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-medium">
                          {c.assignedTo}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <p className="text-slate-800 font-medium truncate">{c.nextAction}</p>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3 text-amber-500" />
                            {c.nextActionDueAt}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {formatMoney(c.balanceMinor, c.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href={`/cases/${c.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#023764] bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Détails</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* View Mode: Kanban */}
        {viewMode === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
            {kanbanColumns.map((col) => {
              const colCases = filteredCases.filter((c) => getKanbanColumnForCase(c) === col.id);
              return (
                <div
                  key={col.id}
                  className="bg-slate-100/70 rounded-2xl p-3 border border-slate-200/80 space-y-3"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {col.title}
                    </span>
                    <span className="w-5 h-5 rounded-full bg-white text-slate-700 font-bold text-[10px] flex items-center justify-center border border-slate-200">
                      {colCases.length}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {colCases.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cases/${c.id}`}
                        className="block bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all space-y-2 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-bold text-slate-500">
                            {c.reference}
                          </span>
                          <span className="text-sm">{c.destinationFlag}</span>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#023764] line-clamp-2 leading-tight">
                          {c.title}
                        </h4>

                        <p className="text-[11px] text-slate-500 font-medium">
                          Client : <strong>{c.clientName}</strong>
                        </p>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {c.nextActionDueAt}
                          </span>
                          <span className="font-bold text-slate-700">
                            {formatMoney(c.balanceMinor, c.currency)}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {colCases.length === 0 && (
                      <div className="p-4 text-center text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        Aucun dossier à cette étape
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function CasesPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Chargement des dossiers...</div>}>
      <CasesPageContent />
    </React.Suspense>
  );
}
