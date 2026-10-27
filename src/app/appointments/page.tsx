"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Plus,
  Clock,
  MapPin,
  User,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { initialAppointments, Appointment } from "@/lib/mockData";

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [view, setView] = useState<"list" | "month">("list");

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Rendez-vous & Convocations
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Planning des simulations d'entretiens, dépôts consulaires et consultations agence.
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("Simulation de création d'un rendez-vous")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Programmer un rendez-vous</span>
          </button>
        </div>

        {/* Appointments List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {appointments.map((apt) => (
            <div
              key={apt.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 hover:border-slate-300 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                  {apt.kindLabel}
                </span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Confirmé
                </span>
              </div>

              <div>
                <h3 className="text-sm font-black text-slate-900 leading-snug">
                  {apt.title}
                </h3>
                <p className="text-xs font-semibold text-[#023764] mt-1">
                  Demandeur : {apt.clientName}
                </p>
                {apt.caseReference && (
                  <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                    Dossier lié : {apt.caseReference}
                  </span>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#023764]" />
                  <span>{apt.date} de {apt.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{apt.location}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Conseiller : {apt.assignedAdvisor}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
