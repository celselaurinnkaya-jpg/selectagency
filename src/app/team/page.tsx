"use client";

import React from "react";
import {
  UserCog,
  UserPlus,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Building2,
  FolderKanban,
  CheckSquare,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { mockCurrentUser } from "@/lib/mockData";

export default function TeamPage() {
  const teamMembers = [
    {
      id: "mem-1",
      name: "Celse Laurin Nkaya",
      email: "celse.nkaya@select-agency.com",
      role: "Propriétaire & Directeur",
      roleBadge: "bg-amber-50 text-amber-900 border-amber-300",
      activeCases: 8,
      status: "Actif",
    },
    {
      id: "mem-2",
      name: "Marcelle Eboa",
      email: "marcelle.eboa@select-agency.com",
      role: "Conseillère Senior Mobilité",
      roleBadge: "bg-blue-50 text-blue-800 border-blue-200",
      activeCases: 7,
      status: "Actif",
    },
    {
      id: "mem-3",
      name: "Jean-Paul Kamga",
      email: "jp.kamga@select-agency.com",
      role: "Conseiller Campus & Visa",
      roleBadge: "bg-blue-50 text-blue-800 border-blue-200",
      activeCases: 4,
      status: "Actif",
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Gestion de l'équipe
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Collaborateurs, conseillers et gestion des rôles de l'agence.
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("Simulation d'envoi d'invitation par e-mail")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Inviter un collaborateur</span>
          </button>
        </div>

        {/* Team Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {teamMembers.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="w-11 h-11 rounded-full bg-[#023764] text-[#F0FF0A] font-black text-sm flex items-center justify-center border border-[#F0FF0A]/40">
                  {member.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${member.roleBadge}`}>
                  {member.role}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-black text-slate-900">{member.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3 text-slate-400" />
                  {member.email}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1 font-semibold text-[#023764]">
                  <FolderKanban className="w-3.5 h-3.5" />
                  {member.activeCases} dossiers assignés
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  {member.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
