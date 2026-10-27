"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Menu,
  Search,
  Bell,
  Plus,
  UserPlus,
  Coins,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { mockCurrentUser } from "@/lib/mockData";

interface TopbarProps {
  onToggleMobileMenu: () => void;
}

export function Topbar({ onToggleMobileMenu }: TopbarProps) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex items-center justify-between px-4 sm:px-6">
      {/* Left: Mobile Toggle & Search */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Ouvrir le menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Input */}
        <div className="relative hidden md:block w-72 lg:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher client, dossier, téléphone... (⌘K)"
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-[#023764] rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-[#023764]/10 text-slate-800 placeholder:text-slate-400"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Actions, Badges & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Currency & Region Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
          <Coins className="w-3.5 h-3.5 text-amber-500" />
          <span>Devise : <strong>XAF (FCFA)</strong></span>
        </div>

        {/* Quick Action: New Client */}
        <Link
          href="/clients/new"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs transition-all"
        >
          <UserPlus className="w-3.5 h-3.5 text-[#023764]" />
          <span>Ajouter un client</span>
        </Link>

        {/* Quick Action: New Case */}
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] rounded-lg shadow-xs hover:shadow transition-all border border-[#d8e600]"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Nouveau dossier</span>
        </Link>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-slate-800">Notifications</span>
                <span className="text-[10px] text-blue-600 font-semibold cursor-pointer hover:underline">
                  Tout marquer comme lu
                </span>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                <div className="px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <p className="font-semibold text-slate-800">
                    Nouveau document reçu
                  </p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Attestation AVI téléversée par Arnaud Tchouameni.
                  </p>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Il y a 35 min
                  </span>
                </div>
                <div className="px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <p className="font-semibold text-slate-800">
                    Acompte encaissé
                  </p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    200 000 XAF via Orange Money pour DOS-2026-00120.
                  </p>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Il y a 2h
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 pl-1 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-[#023764] text-[#F0FF0A] font-bold text-xs flex items-center justify-center border border-[#023764]/20 shadow-2xs">
            CN
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-tight">
              {mockCurrentUser.name}
            </p>
            <p className="text-[10px] text-slate-500">
              {mockCurrentUser.agencyName.split("—")[1] || "Douala"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
