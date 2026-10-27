"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FolderPlus,
  ArrowLeft,
  CheckCircle2,
  GraduationCap,
  Plane,
  Briefcase,
  FileText,
  User,
  Calendar,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { initialClients, mockCurrentUser, CaseCategory } from "@/lib/mockData";

function NewCaseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams?.get("clientId") || initialClients[0]?.id || "";

  const [clientId, setClientId] = useState(preselectedClientId);
  const [category, setCategory] = useState<CaseCategory>("study_abroad");
  const [destinationCountry, setDestinationCountry] = useState("France");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [assignedTo, setAssignedTo] = useState(mockCurrentUser.name);
  const [nextAction, setNextAction] = useState("Collecte et vérification des pièces justificatives");
  const [nextActionDueAt, setNextActionDueAt] = useState("05/11/2026");
  
  // Specific study fields
  const [university, setUniversity] = useState("");
  const [program, setProgram] = useState("");
  const [intakeTerm, setIntakeTerm] = useState("Rentrée Septembre 2027");

  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      router.push("/cases");
    }, 700);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back Link & Header */}
      <div>
        <Link
          href="/cases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour à la liste des dossiers</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#023764] flex items-center justify-center border border-blue-100">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Créer un nouveau dossier de mobilité
            </h1>
            <p className="text-xs text-slate-500">
              Ouverture de la procédure et initialisation du workflow administratif.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-6"
      >
        {/* Section 1: Client & Category */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
            1. Demandeur & Catégorie de mobilité
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Client associé <span className="text-rose-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              >
                {initialClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} ({c.reference} — {c.country})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Type de projet <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CaseCategory)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              >
                <option value="study_abroad">Études à l'étranger (Campus / Admission)</option>
                <option value="tourist_visa">Visa touristique & Séjour court</option>
                <option value="business_travel">Voyage d'affaires & Missions</option>
                <option value="administrative_support">Accompagnement administratif</option>
                <option value="custom_trip">Séjour personnalisé</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pays de destination <span className="text-rose-500">*</span>
              </label>
              <select
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              >
                <option value="France">France 🇫🇷</option>
                <option value="Canada">Canada 🇨🇦</option>
                <option value="Belgique">Belgique 🇧🇪</option>
                <option value="Émirats Arabes Unis">Émirats Arabes Unis 🇦🇪</option>
                <option value="Chine">Chine 🇨🇳</option>
                <option value="Royaume-Uni">Royaume-Uni 🇬🇧</option>
                <option value="États-Unis">États-Unis 🇺🇸</option>
                <option value="Autre destination">Autre destination</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Priorité opérationnelle
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              >
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente (départ proche)</option>
                <option value="low">Basse</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Intitulé résumé du dossier <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex : Master 1 Informatique — Université de Lyon (France)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
            />
          </div>
        </div>

        {/* Section 2: Conditional Study Abroad Details */}
        {category === "study_abroad" && (
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-4">
            <h3 className="text-xs font-bold text-[#023764] flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              Détails académiques (Études à l'étranger)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Établissement / Université ciblée
                </label>
                <input
                  type="text"
                  placeholder="Ex : Université Claude Bernard Lyon 1"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#023764]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Filière / Niveau d'études
                </label>
                <input
                  type="text"
                  placeholder="Ex : Master 1 Données & IA"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#023764]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Session de rentrée visée
              </label>
              <input
                type="text"
                placeholder="Ex : Rentrée Septembre 2027"
                value={intakeTerm}
                onChange={(e) => setIntakeTerm(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#023764]"
              />
            </div>
          </div>
        )}

        {/* Section 3: Next Action & Assignment */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
            2. Pilotage & Conseiller responsable
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Conseiller responsable
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              >
                <option value={mockCurrentUser.name}>{mockCurrentUser.name} (Directeur)</option>
                <option value="Marcelle Eboa">Marcelle Eboa (Conseillère Senior)</option>
                <option value="Jean-Paul Kamga">Jean-Paul Kamga (Conseiller)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Date de prochaine échéance
              </label>
              <input
                type="text"
                placeholder="JJ/MM/AAAA"
                value={nextActionDueAt}
                onChange={(e) => setNextActionDueAt(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Prochaine action à mener
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-[#023764]"
            />
          </div>
        </div>

        {/* Footer Submit */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <Link
            href="/cases"
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Annuler
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Initialisation du workflow...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Créer le dossier et générer la checklist</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewCasePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Chargement...</div>}>
        <NewCaseForm />
      </Suspense>
    </AppShell>
  );
}
