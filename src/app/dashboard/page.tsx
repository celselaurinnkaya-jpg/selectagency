"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  FolderKanban,
  AlertCircle,
  Calendar,
  CreditCard,
  PiggyBank,
  Plus,
  UserPlus,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  Eye,
  Filter,
  TrendingUp,
  MapPin,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, BadgeVariant } from "@/components/shared/StatusBadge";
import {
  mockCurrentUser,
  mockMetrics,
  formatMoney,
  initialCases,
  initialTasks,
  initialAppointments,
  initialActivities,
  TravelCase,
} from "@/lib/mockData";

export default function DashboardPage() {
  const [caseFilter, setCaseFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredCases = initialCases.filter((c) => {
    if (caseFilter !== "all" && c.category !== caseFilter) return false;
    if (
      searchQuery &&
      !c.clientName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !c.reference.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !c.destinationCountry.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Map case status to badge variant
  const getStatusVariant = (status: string, currentStep: string): { label: string; variant: BadgeVariant } => {
    if (status === "closed") {
      return { label: "Terminé", variant: "emerald" };
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

  // 6 months evolution data
  const monthlyData = [
    { month: "Mai", cases: 8, amount: 4800000 },
    { month: "Juin", cases: 11, amount: 6200000 },
    { month: "Juil", cases: 14, amount: 8900000 },
    { month: "Août", cases: 18, amount: 11400000 },
    { month: "Sept", cases: 16, amount: 13100000 },
    { month: "Oct", cases: 19, amount: 14850000 },
  ];
  const maxCases = Math.max(...monthlyData.map((d) => d.cases));

  return (
    <AppShell>
      <div className="space-y-6">
        {/* En-tête officiel */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Tableau de bord
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                En direct
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Voici un aperçu de l'activité de votre agence. • Date :{" "}
              <strong className="text-slate-700">27 octobre 2026</strong>
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-all hover:border-slate-300"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#023764]" />
              <span>Ajouter un client</span>
            </Link>

            <Link
              href="/cases/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nouveau dossier</span>
            </Link>
          </div>
        </div>

        {/* Hero Welcome Banner (Inspiration UNIP / SELECT Agency) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#01182c] via-[#023764] to-[#034882] p-5 sm:p-6 text-white shadow-sm border border-[#03345e]">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[11px] font-medium backdrop-blur-xs mb-1">
                <Sparkles className="w-3 h-3 text-[#F0FF0A]" />
                <span>Espace de gestion certifié</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Bienvenue à nouveau,{" "}
                <span className="text-[#F0FF0A]">{mockCurrentUser.name.toUpperCase()}</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                Accédez rapidement à vos services, dossiers, rendez-vous consulaires et informations clients.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="bg-[#011e37]/80 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#F0FF0A] animate-pulse" />
                <span className="text-slate-200">
                  <strong className="text-white">19</strong> dossiers actifs
                </span>
              </div>
              <div className="bg-[#011e37]/80 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-slate-200">
                  <strong className="text-white">4</strong> tâches urgentes
                </span>
              </div>
            </div>
          </div>

          {/* Decorative Glow */}
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-[#F0FF0A]/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* 6 Cartes Statistiques Modernes */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Carte 1 : Clients */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Clients
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#023764] flex items-center justify-center">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {mockMetrics.totalClients}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">Clients enregistrés</p>
            </div>
          </div>

          {/* Carte 2 : Dossiers actifs */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Dossiers actifs
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <FolderKanban className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black text-emerald-700 tracking-tight">
                {mockMetrics.activeCases}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">En cours de traitement</p>
            </div>
          </div>

          {/* Carte 3 : Dossiers incomplets */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Incomplets
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black text-amber-600 tracking-tight">
                {mockMetrics.incompleteCases}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">Pièces à fournir</p>
            </div>
          </div>

          {/* Carte 4 : Rendez-vous à venir */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Rendez-vous
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5">
              <span className="text-2xl font-black text-purple-700 tracking-tight">
                {mockMetrics.upcomingAppointments}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">7 prochains jours</p>
            </div>
          </div>

          {/* Carte 5 : Paiements reçus */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Encaissé
              </span>
              <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5">
              <span className="text-lg font-black text-slate-900 tracking-tight truncate block">
                {formatMoney(mockMetrics.receivedPaymentsMinor, mockMetrics.currency)}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">Période en cours</p>
            </div>
          </div>

          {/* Carte 6 : Soldes à recevoir */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Soldes dûs
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
                <PiggyBank className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-2.5">
              <span className="text-lg font-black text-rose-600 tracking-tight truncate block">
                {formatMoney(mockMetrics.balanceDueMinor, mockMetrics.currency)}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">Reste à recouvrer</p>
            </div>
          </div>
        </div>

        {/* Section Graphiques : Évolution & Répartition */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Évolution sur 6 mois */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#023764]" />
                  Évolution des dossiers créés (6 derniers mois)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Volume mensuel des nouveaux dossiers pris en charge
                </p>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md self-start sm:self-auto">
                Données réelles de démonstration
              </span>
            </div>

            {/* Visual Histogram Chart */}
            <div className="mt-6 flex items-end justify-between gap-3 h-48 px-2 pt-6">
              {monthlyData.map((d, i) => {
                const heightPercent = Math.round((d.cases / maxCases) * 100);
                const isCurrent = i === monthlyData.length - 1;
                return (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-[11px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.cases} dossiers
                    </span>
                    <div className="w-full max-w-[48px] bg-slate-100 rounded-t-lg h-36 flex items-end overflow-hidden p-1">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          isCurrent
                            ? "bg-gradient-to-t from-[#023764] to-[#0460ad]"
                            : "bg-slate-300 group-hover:bg-[#023764]/70"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        isCurrent ? "text-[#023764] font-black" : "text-slate-500"
                      }`}
                    >
                      {d.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Répartition des dossiers par statut */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Répartition des dossiers
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Statuts opérationnels internes
              </p>

              <div className="mt-5 space-y-3.5">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">En cours de préparation</span>
                    <span className="font-bold text-slate-800">8 dossiers (42%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: "42%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Documents à compléter</span>
                    <span className="font-bold text-amber-600">5 dossiers (26%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: "26%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Attente réponse consulaire</span>
                    <span className="font-bold text-yellow-600">4 dossiers (21%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 rounded-full" style={{ width: "21%" }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Nouveaux dossiers</span>
                    <span className="font-bold text-sky-600">2 dossiers (11%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: "11%" }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 leading-tight">
              <strong>Notice déontologique :</strong> Les statuts indiquent l'avancement interne auprès de l'agence. Les décisions d'octroi de visa ou d'admission relèvent exclusivement des autorités officielles.
            </div>
          </div>
        </div>

        {/* Tableau des Dossiers Récents */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* Header & Filters */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Dossiers récents
              </h3>
              <p className="text-xs text-slate-500">
                Dossiers en cours de traitement et actions requises
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100/60 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setCaseFilter("all")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    caseFilter === "all"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setCaseFilter("study_abroad")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    caseFilter === "study_abroad"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Études
                </button>
                <button
                  type="button"
                  onClick={() => setCaseFilter("tourist_visa")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    caseFilter === "tourist_visa"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Visas tourisme
                </button>
                <button
                  type="button"
                  onClick={() => setCaseFilter("business_travel")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    caseFilter === "business_travel"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Affaires
                </button>
              </div>

              <Link
                href="/cases"
                className="text-xs font-semibold text-[#023764] hover:underline flex items-center gap-1 pl-2"
              >
                <span>Voir tous les dossiers</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Type de projet</th>
                  <th className="py-3 px-4">Destination</th>
                  <th className="py-3 px-4">Statut / Étape</th>
                  <th className="py-3 px-4">Conseiller</th>
                  <th className="py-3 px-4">Prochaine échéance</th>
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
                      <td className="py-3.5 px-4">
                        <Link href={`/clients/${c.clientId}`} className="font-bold text-slate-800 hover:text-blue-700">
                          {c.clientName}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {c.categoryLabel}
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
                      <td className="py-3.5 px-4 text-slate-600">
                        {c.assignedTo}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {c.nextActionDueAt}
                        </span>
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

        {/* Section 2 colonnes : Tâches urgentes & Prochains rendez-vous */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tâches urgentes */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tâches urgentes & Échéances
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Actions requises immédiatement
                  </p>
                </div>
              </div>

              <Link
                href="/tasks"
                className="text-xs font-semibold text-[#023764] hover:underline"
              >
                Gérer les tâches ({initialTasks.length})
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {initialTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 transition-all flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {t.isUrgent && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-50 text-rose-700 border border-rose-200">
                          Urgent
                        </span>
                      )}
                      <span className="text-[11px] font-mono font-semibold text-slate-500">
                        {t.caseReference}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] font-medium text-slate-700">
                        {t.clientName}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">
                      {t.title}
                    </p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      Échéance : <strong>{t.dueAt}</strong> • Conseiller : {t.assignedTo}
                    </p>
                  </div>

                  <Link
                    href={`/cases/${initialCases[0]?.id || "case-1"}`}
                    className="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Traiter
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Prochains Rendez-vous */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <CalendarDays className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Prochains rendez-vous
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Convocations consulaires et entretiens d'agence
                  </p>
                </div>
              </div>

              <Link
                href="/appointments"
                className="text-xs font-semibold text-[#023764] hover:underline"
              >
                Voir le calendrier
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {initialAppointments.map((a) => (
                <div
                  key={a.id}
                  className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 transition-all flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200">
                        {a.kindLabel}
                      </span>
                      {a.caseReference && (
                        <span className="text-[11px] font-mono text-slate-500">
                          {a.caseReference}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-800">
                      {a.clientName}
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {a.title}
                    </p>
                    <div className="text-[10px] text-slate-400 flex items-center gap-2 pt-0.5">
                      <span className="flex items-center gap-1 text-slate-600 font-semibold">
                        <Calendar className="w-3 h-3 text-[#023764]" />
                        {a.date} à {a.time}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {a.location}
                      </span>
                    </div>
                  </div>

                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Confirmé
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
