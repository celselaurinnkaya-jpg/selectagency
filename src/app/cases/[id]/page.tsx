"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  FolderKanban,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  Calendar,
  CreditCard,
  History,
  FileCheck,
  AlertTriangle,
  Building,
  GraduationCap,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Download,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  initialCases,
  initialClients,
  formatMoney,
  TravelCase,
} from "@/lib/mockData";

function CaseDetailContent() {
  const params = useParams();
  const caseId = params?.id as string;

  const currentCase = initialCases.find((c) => c.id === caseId) || initialCases[0]!;
  const client = initialClients.find((cl) => cl.id === currentCase.clientId) || initialClients[0]!;

  const [activeTab, setActiveTab] = useState<"workflow" | "documents" | "finance" | "tasks">("workflow");

  // Workflow steps for study abroad or visa
  const workflowSteps = [
    { id: 1, label: "Nouveau candidat", status: "completed", date: "15/09/2026", actor: "Agence" },
    { id: 2, label: "Vérification du profil & Faisabilité", status: "completed", date: "22/09/2026", actor: "Agence" },
    { id: 3, label: "Collecte & Authentification des pièces", status: "completed", date: "08/10/2026", actor: "Client" },
    { id: 4, label: "Préparation dossier de visa", status: "current", date: "En cours", actor: "Agence" },
    { id: 5, label: "Rendez-vous dépôt & Biométrie", status: "upcoming", date: "Prévu le 29/10", actor: "Consulat" },
    { id: 6, label: "Décision consulaire officielle", status: "upcoming", date: "En attente", actor: "Consulat" },
    { id: 7, label: "Remise passeport & Clôture", status: "upcoming", date: "—", actor: "Agence" },
  ];

  // Document checklist items for this case
  const [documents, setDocuments] = useState([
    {
      id: "doc-1",
      name: "Passeport biométrique (validité > 6 mois après retour)",
      category: "Identité",
      isRequired: true,
      status: "validated",
      statusLabel: "Vérifié par l'agence",
      filename: "passeport_arnaud_scan.pdf",
      date: "16/09/2026",
    },
    {
      id: "doc-2",
      name: "Lettre d'acceptation officielle de l'Université de Lyon",
      category: "Académique",
      isRequired: true,
      status: "validated",
      statusLabel: "Vérifié par l'agence",
      filename: "lettre_admission_lyon1.pdf",
      date: "25/09/2026",
    },
    {
      id: "doc-3",
      name: "Attestation de Virement Irrévocable (AVI bancaire)",
      category: "Financier",
      isRequired: true,
      status: "to_verify",
      statusLabel: "À vérifier par le conseiller",
      filename: "avi_banque_douala.pdf",
      date: "Aujourd'hui à 09:30",
    },
    {
      id: "doc-4",
      name: "Attestation d'hébergement ou bail locatif à Lyon",
      category: "Logement",
      isRequired: true,
      status: "not_received",
      statusLabel: "Non reçu — Manquant",
      filename: null,
      date: null,
    },
  ]);

  const handleVerifyDoc = (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, status: "validated", statusLabel: "Vérifié par l'agence" }
          : d
      )
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Back Link */}
        <Link
          href="/cases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour à la liste des dossiers</span>
        </Link>

        {/* Case Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                  {currentCase.reference}
                </span>
                <span className="text-xs font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                  {currentCase.categoryLabel}
                </span>
                <StatusBadge label={currentCase.currentStep} variant="purple" />
              </div>

              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight pt-1">
                {currentCase.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                <span className="flex items-center gap-1 font-bold text-slate-800">
                  <User className="w-3.5 h-3.5 text-[#023764]" />
                  Client :{" "}
                  <Link href={`/clients/${client.id}`} className="hover:underline text-blue-700">
                    {client.firstName} {client.lastName}
                  </Link>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <span>{currentCase.destinationFlag}</span>
                  Destination : {currentCase.destinationCountry}
                </span>
                <span>•</span>
                <span className="text-slate-600">Conseiller : <strong>{currentCase.assignedTo}</strong></span>
              </div>
            </div>

            {/* Financial Summary Pill */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total convenu</span>
                <span className="font-bold text-slate-800 text-sm">
                  {formatMoney(currentCase.totalAmountMinor, currentCase.currency)}
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Encaissé net</span>
                <span className="font-bold text-emerald-700 text-sm">
                  {formatMoney(currentCase.paidAmountMinor, currentCase.currency)}
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Solde dû</span>
                <span className="font-bold text-rose-600 text-sm">
                  {formatMoney(currentCase.balanceMinor, currentCase.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Next Action Banner */}
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold text-amber-950">Prochaine action requise :</span>{" "}
                <span className="text-amber-900">{currentCase.nextAction}</span>
              </div>
            </div>
            <span className="font-mono font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 shrink-0">
              Échéance : {currentCase.nextActionDueAt}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 flex gap-6 text-xs font-bold text-slate-500 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("workflow")}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "workflow"
                ? "border-[#023764] text-[#023764]"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Workflow & Progression des étapes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "documents"
                ? "border-[#023764] text-[#023764]"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <span>Documents & Checklist</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800">
              {documents.filter((d) => d.status !== "validated").length} manquants/à vérifier
            </span>
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
            Finances & Reçus
          </button>
        </div>

        {/* Tab 1: Workflow Progression */}
        {activeTab === "workflow" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Parcours et étapes du dossier
                </h3>
                <p className="text-xs text-slate-500">
                  Modèle copié au moment de l'ouverture du dossier (conforme ADR 005)
                </p>
              </div>

              <button
                type="button"
                onClick={() => alert("Simulation de transition d'étape avec saisie du motif")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs"
              >
                <span>Avancer à l'étape suivante</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Stepper List */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {workflowSteps.map((step) => {
                const isCompleted = step.status === "completed";
                const isCurrent = step.status === "current";
                return (
                  <div key={step.id} className="relative flex items-start gap-4">
                    {/* Step Icon Indicator */}
                    <div
                      className={`absolute -left-6 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-white ${
                        isCompleted
                          ? "bg-emerald-500 text-white"
                          : isCurrent
                          ? "bg-[#023764] text-[#F0FF0A] ring-blue-100"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.id}
                    </div>

                    {/* Step Info */}
                    <div
                      className={`flex-1 p-3.5 rounded-xl border transition-all ${
                        isCurrent
                          ? "bg-blue-50/40 border-[#023764]/30 shadow-2xs"
                          : "bg-slate-50/50 border-slate-200/80"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          {step.label}
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#023764] text-white">
                              Étape active
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Responsable : <strong>{step.actor}</strong> • {step.date}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Traçabilité garantie : tout changement d'étape est consigné dans le journal d'audit immuable avec horodatage et identifiant du collaborateur.
              </span>
            </div>
          </div>
        )}

        {/* Tab 2: Documents & Checklist */}
        {activeTab === "documents" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Checklist documentaire du dossier
                </h3>
                <p className="text-xs text-slate-500">
                  Exigences obligatoires pour la constitution du dossier de visa et d'études
                </p>
              </div>

              <button
                type="button"
                onClick={() => alert("Simulation d'ajout d'une exigence documentaire")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter une pièce</span>
              </button>
            </div>

            <div className="space-y-3">
              {documents.map((doc) => {
                const isValidated = doc.status === "validated";
                const isToVerify = doc.status === "to_verify";
                const isMissing = doc.status === "not_received";

                return (
                  <div
                    key={doc.id}
                    className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {doc.category}
                        </span>
                        {doc.isRequired && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            Obligatoire
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-900">{doc.name}</p>
                      {doc.filename ? (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-mono text-slate-700">{doc.filename}</span>
                          <span className="text-slate-300">•</span>
                          <span>Reçu le {doc.date}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Document en attente de transmission par le client
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {isValidated && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Vérifié par l'agence</span>
                        </span>
                      )}

                      {isToVerify && (
                        <button
                          type="button"
                          onClick={() => handleVerifyDoc(doc.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>Valider la pièce</span>
                        </button>
                      )}

                      {isMissing && (
                        <button
                          type="button"
                          onClick={() => alert("Simulation du téléversement avec URL signée Storage")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#023764] bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Téléverser</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Finance */}
        {activeTab === "finance" && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Décompte financier & Reçus émis
                </h3>
                <p className="text-xs text-slate-500">
                  Devise de facturation unique du dossier : <strong>XAF (Franc CFA)</strong>
                </p>
              </div>

              <Link
                href={`/finance/payments?caseId=${currentCase.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Enregistrer un encaissement</span>
              </Link>
            </div>

            {/* Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 block text-[11px] font-bold uppercase">Prestations convenues</span>
                <span className="text-xl font-black text-slate-900 mt-1 block">
                  {formatMoney(currentCase.totalAmountMinor, currentCase.currency)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Honoraires agence : 800 000 XAF • Frais tiers : 450 000 XAF
                </span>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200">
                <span className="text-emerald-700 block text-[11px] font-bold uppercase">Encaissé net</span>
                <span className="text-xl font-black text-emerald-800 mt-1 block">
                  {formatMoney(currentCase.paidAmountMinor, currentCase.currency)}
                </span>
                <span className="text-[10px] text-emerald-700 block mt-1">
                  Acomptes validés avec reçus officiels
                </span>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200">
                <span className="text-rose-700 block text-[11px] font-bold uppercase">Solde restant à régler</span>
                <span className="text-xl font-black text-rose-800 mt-1 block">
                  {formatMoney(currentCase.balanceMinor, currentCase.currency)}
                </span>
                <span className="text-[10px] text-rose-700 block mt-1">
                  Exigible avant transmission consulaire
                </span>
              </div>
            </div>

            {/* Reçus émis */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Reçus officiels émis pour ce dossier
              </h4>

              <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900">REC-2026-00088</span>
                  <span className="text-slate-400 mx-2">•</span>
                  <span className="text-slate-600">Acompte frais de dossier & Campus France</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Payé le 18/09/2026 par Orange Money • Encaissé par {currentCase.assignedTo}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-900">850 000 XAF</span>
                  <button
                    type="button"
                    onClick={() => alert("Téléchargement du reçu PDF REC-2026-00088")}
                    className="p-1.5 rounded-md text-slate-600 hover:text-[#023764] hover:bg-slate-100"
                    title="Imprimer le reçu"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function CaseDetailPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Chargement du dossier...</div>}>
      <CaseDetailContent />
    </React.Suspense>
  );
}
