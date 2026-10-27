"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Phone,
  Mail,
  MapPin,
  FolderKanban,
  MoreVertical,
  Calendar,
  Eye,
  Edit,
  ArrowUpDown,
  Building,
  GraduationCap,
  Briefcase,
  User,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { initialClients, Client } from "@/lib/mockData";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.firstName.toLowerCase().includes(search.toLowerCase()) ||
      c.lastName.toLowerCase().includes(search.toLowerCase()) ||
      c.reference.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase());

    const matchesCountry = countryFilter === "all" || c.country === countryFilter;
    const matchesType = typeFilter === "all" || c.type === typeFilter;

    return matchesSearch && matchesCountry && matchesType;
  });

  const getTypeBadge = (type: Client["type"]) => {
    switch (type) {
      case "student":
        return { label: "Étudiant", color: "bg-blue-50 text-blue-700 border-blue-200", icon: GraduationCap };
      case "professional":
        return { label: "Professionnel", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Briefcase };
      case "company":
        return { label: "Entreprise", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Building };
      default:
        return { label: "Particulier", color: "bg-slate-100 text-slate-700 border-slate-200", icon: User };
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Gestion des clients
              </h1>
              <span className="px-2 py-0.5 text-xs font-bold bg-[#023764]/10 text-[#023764] rounded-full">
                {filteredClients.length} clients
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Répertoire officiel des demandeurs et profils accompagnés par l'agence.
            </p>
          </div>

          <Link
            href="/clients/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Ajouter un client</span>
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom, référence CLI-..., téléphone ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-[#023764] rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#023764]/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Tous les pays de résidence</option>
              <option value="Cameroun">Cameroun</option>
              <option value="Côte d'Ivoire">Côte d'Ivoire</option>
              <option value="Togo">Togo</option>
              <option value="RD Congo">RD Congo</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white focus:outline-none"
            >
              <option value="all">Tous les types de profils</option>
              <option value="student">Étudiants / Candidats</option>
              <option value="individual">Particuliers / Tourisme</option>
              <option value="professional">Professionnels</option>
              <option value="company">Entreprises</option>
            </select>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Client & Contact</th>
                  <th className="py-3 px-4">Type de profil</th>
                  <th className="py-3 px-4">Pays / Ville</th>
                  <th className="py-3 px-4">Dossiers</th>
                  <th className="py-3 px-4">Date d'inscription</th>
                  <th className="py-3 px-4">Dernière activité</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => {
                  const typeBadge = getTypeBadge(client.type);
                  const TypeIcon = typeBadge.icon;
                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <Link href={`/clients/${client.id}`} className="hover:text-[#023764] hover:underline">
                          {client.reference}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <Link href={`/clients/${client.id}`} className="block">
                          <p className="font-bold text-slate-900 group-hover:text-[#023764]">
                            {client.firstName} {client.lastName}
                          </p>
                          <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-0.5">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {client.phone}
                            </span>
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {client.email}
                            </span>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${typeBadge.color}`}
                        >
                          <TypeIcon className="w-3 h-3" />
                          <span>{typeBadge.label}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {client.city}, {client.country}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-bold text-[#023764] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          <FolderKanban className="w-3 h-3" />
                          {client.casesCount} dossier(s)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {client.registeredAt}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {client.lastActivity}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/clients/${client.id}`}
                            className="p-1.5 rounded-md text-slate-600 hover:text-[#023764] hover:bg-slate-100 transition-colors"
                            title="Consulter le profil"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <Link
                            href={`/cases/new?clientId=${client.id}`}
                            className="p-1.5 rounded-md text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Créer un nouveau dossier pour ce client"
                          >
                            <FolderKanban className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
