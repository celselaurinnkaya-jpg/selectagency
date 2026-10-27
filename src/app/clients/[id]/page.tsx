"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FolderKanban,
  CreditCard,
  FileText,
  Clock,
  Eye,
  EyeOff,
  ShieldAlert,
  Plus,
  Send,
  MessageSquare,
  AlertCircle,
  Building,
  GraduationCap,
  Briefcase,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  initialClients,
  initialCases,
  initialAppointments,
  initialActivities,
  formatMoney,
  Client,
} from "@/lib/mockData";

function ClientDetailContent() {
  const params = useParams();
  const clientId = params?.id as string;

  const client = initialClients.find((c) => c.id === clientId) || initialClients[0]!;
  const clientCases = initialCases.filter((c) => c.clientId === client.id);
  const clientAppointments = initialAppointments.filter((a) => a.clientName.includes(client.lastName));

  const [activeTab, setActiveTab] = useState<"overview" | "cases" | "appointments" | "finance" | "comms">("overview");
  const [showPassport, setShowPassport] = useState(false);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Back Link */}
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour aux clients</span>
        </Link>

        {/* Client Profile Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#023764] text-[#F0FF0A] font-black text-xl flex items-center justify-center border-2 border-[#F0FF0A]/40 shadow-sm shrink-0">
              {client.firstName[0]}
              {client.lastName[0]}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {client.firstName} {client.lastName}
                </h1>
                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  {client.reference}
                </span>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {client.type === "student" ? "Étudiant" : "Professionnel"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  {client.phone}
                </span>
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  {client.email}
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {client.city}, {client.country}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <a
              href={`https://wa.me/${client.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>

            <Link
              href={`/cases/new?clientId=${client.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Nouveau dossier</span>
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 flex gap-6 text-xs font-bold text-slate-500 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "overview"
                ? "border-[#023764] text-[#023764]"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Vue générale & Identité
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cases")}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "cases"
                ? "border-[#023764] text-[#023764]"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <span>Dossiers de mobilité</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-[#023764]">
              {clientCases.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("appointments")}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "appointments"
                ? "border-[#023764] text-[#023764]"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Rendez-vous ({clientAppointments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("finance")}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "finance"
                ? "border-[#023764] text-[#023764]"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Paiements & Reçus
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Identity Card */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-[#023764]" />
                Données d'identification et voyage
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Date d'enregistrement</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{client.registeredAt}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Conseiller principal</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{client.assignedAdvisor}</span>
                </div>

                {/* Passport encrypted display as required by ADR 008 */}
                <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 block text-[11px] font-medium">
                      Numéro de passeport (chiffré AES-256)
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                      {showPassport ? `CM26A8472` : `•••• •••• ${client.passportLast4 || "8472"}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassport(!showPassport)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-[#023764] hover:bg-blue-100/60 transition-colors"
                    title={showPassport ? "Masquer" : "Révéler (action auditée)"}
                  >
                    {showPassport ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Langue officielle</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">Français</span>
                </div>
              </div>

              {client.notes && (
                <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80">
                  <span className="text-[11px] font-bold text-amber-900 block mb-1">
                    Notes internes du dossier
                  </span>
                  <p className="text-xs text-amber-950 leading-relaxed">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Quick Actions / Activity Box */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Activité récente</h3>
              <div className="space-y-3 text-xs">
                {initialActivities.slice(0, 3).map((act) => (
                  <div key={act.id} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                    <p className="font-bold text-slate-800">{act.title}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">{act.description}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">{act.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Cases */}
        {activeTab === "cases" && (
          <div className="space-y-4">
            {clientCases.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {clientCases.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {c.reference}
                      </span>
                      <StatusBadge label={c.currentStep} variant="purple" />
                    </div>

                    <h4 className="text-sm font-black text-slate-900 leading-snug">
                      {c.title}
                    </h4>

                    <div className="text-xs text-slate-500 space-y-1">
                      <p>Destination : <strong>{c.destinationCountry}</strong></p>
                      <p>Prochaine action : {c.nextAction}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Solde dû : {formatMoney(c.balanceMinor, c.currency)}
                      </span>
                      <Link
                        href={`/cases/${c.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#023764] hover:underline"
                      >
                        <span>Ouvrir le dossier</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                <FolderKanban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">Aucun dossier en cours pour ce client</p>
                <Link
                  href={`/cases/new?clientId=${client.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F0FF0A] rounded-lg"
                >
                  Créer son premier dossier
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Tab Appointments */}
        {activeTab === "appointments" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            {clientAppointments.length > 0 ? (
              clientAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200">
                      {apt.kindLabel}
                    </span>
                    <p className="text-xs font-bold text-slate-900 mt-1">{apt.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {apt.date} à {apt.time} • Lieu : {apt.location}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Confirmé
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 py-4 text-center">
                Aucun rendez-vous consulaire ou agence programmé.
              </p>
            )}
          </div>
        )}

        {/* Tab Finance */}
        {activeTab === "finance" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Historique financier du client</h3>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row justify-between gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Total honoraires & frais</span>
                <span className="text-base font-black text-slate-900">
                  {formatMoney(clientCases.reduce((acc, c) => acc + c.totalAmountMinor, 0))}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Total encaissé net</span>
                <span className="text-base font-black text-emerald-700">
                  {formatMoney(clientCases.reduce((acc, c) => acc + c.paidAmountMinor, 0))}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Solde restant à payer</span>
                <span className="text-base font-black text-rose-600">
                  {formatMoney(clientCases.reduce((acc, c) => acc + c.balanceMinor, 0))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ClientDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Chargement du client...</div>}>
      <ClientDetailContent />
    </React.Suspense>
  );
}
