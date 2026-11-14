"use client";

import {
  MessagesSquare,
  Bot,
  User,
  Lightbulb,
  Coins,
  Gauge,
  Calendar,
} from "lucide-react";
import { Card, Section } from "@/components/shared/ui";
import type { AiStatsSummary } from "@/lib/domain/ai";

interface AiStatsManagerProps {
  stats: AiStatsSummary;
  agencyName: string;
}

export function AiStatsManager({ stats, agencyName }: AiStatsManagerProps) {
  const currentMonthLabel = new Date().toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* En-tête de période */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-navy-800" />
            <h3 className="font-bold text-navy-900 text-sm capitalize">
              Période en cours : {currentMonthLabel}
            </h3>
            <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-medium text-navy-800 border border-navy-200 uppercase">
              Formule {stats.planTier}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Suivi en temps réel de l&apos;activité de l&apos;Agent IA pour {agencyName}.
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-500">Coût estimé ce mois-ci</span>
          <p className="text-lg font-bold text-navy-900 tabular-nums">
            ~{stats.estimatedCostFcfa.toLocaleString()} FCFA
          </p>
        </div>
      </div>

      {/* Cartes KPI clés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Conversations</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-800">
              <MessagesSquare className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-900 tabular-nums">
            {stats.totalConversations}
          </p>
          <p className="text-[11px] text-slate-500">Total des fils ouverts</p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Réponses IA</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
              <Bot className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-800 tabular-nums">
            {stats.aiRepliesCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">
            Sur un quota de {stats.monthlyQuota.toLocaleString()}
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Messages entrants</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-800">
              <User className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-900 tabular-nums">
            {stats.inboundCount}
          </p>
          <p className="text-[11px] text-slate-500">Reçus de vos clients</p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Consommation</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-navy-900 tabular-nums">
            {stats.percentQuotaUsed}%
          </p>
          <p className="text-[11px] text-slate-500">Du quota de formule utilisé</p>
        </Card>
      </div>

      {/* Jauge du quota mensuel */}
      <Section title="Consommation du quota mensuel">
        <p className="text-sm text-slate-600 mb-4 -mt-1">
          Chaque réponse envoyée par l&apos;IA consomme 1 crédit sur le quota de votre abonnement.
        </p>

        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-navy-800" />
              <span className="font-semibold text-navy-900">
                {stats.aiRepliesCount.toLocaleString()} / {stats.monthlyQuota.toLocaleString()} réponses utilisées
              </span>
            </div>
            <span className="font-bold text-navy-900">{stats.percentQuotaUsed}%</span>
          </div>

          {/* Barre de progression */}
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                stats.percentQuotaUsed > 90
                  ? "bg-red-500"
                  : stats.percentQuotaUsed > 70
                    ? "bg-amber-500"
                    : "bg-navy-800"
              }`}
              style={{ width: `${Math.max(3, stats.percentQuotaUsed)}%` }}
            />
          </div>

          <p className="text-xs text-slate-500">
            Le quota se renouvelle automatiquement au début de chaque période de facturation.
          </p>
        </Card>
      </Section>

      {/* Répartition des conversations par mode */}
      <Section title="Répartition des discussions actives">
        <p className="text-sm text-slate-600 mb-4 -mt-1">
          La répartition entre l&apos;automatisation totale, l&apos;assistance et l&apos;intervention humaine.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4 space-y-2 border-l-4 border-l-blue-600">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-600" />
              <h4 className="font-bold text-navy-900 text-sm">IA Automatique</h4>
            </div>
            <p className="text-2xl font-bold text-navy-900 tabular-nums">
              {stats.aiConversationsCount}
            </p>
            <p className="text-xs text-slate-500">Discussions gérées en totale autonomie 24h/24.</p>
          </Card>

          <Card className="p-4 space-y-2 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-bold text-navy-900 text-sm">Assistance IA</h4>
            </div>
            <p className="text-2xl font-bold text-navy-900 tabular-nums">
              {stats.assistConversationsCount}
            </p>
            <p className="text-xs text-slate-500">Réponses suggérées par l&apos;IA et validées par l&apos;équipe.</p>
          </Card>

          <Card className="p-4 space-y-2 border-l-4 border-l-purple-600">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-purple-600" />
              <h4 className="font-bold text-navy-900 text-sm">Conseiller Direct</h4>
            </div>
            <p className="text-2xl font-bold text-navy-900 tabular-nums">
              {stats.humanConversationsCount}
            </p>
            <p className="text-xs text-slate-500">Dossiers complexes ou négociations reprises par l&apos;humain.</p>
          </Card>
        </div>
      </Section>
    </div>
  );
}

