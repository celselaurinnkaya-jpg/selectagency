"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  FolderKanban,
  GraduationCap,
  Plane,
  Briefcase,
  FileText,
  CalendarDays,
  CheckSquare,
  CreditCard,
  Receipt,
  BarChart3,
  UserCog,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LogOut,
  Building2,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { mockCurrentUser } from "@/lib/mockData";

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

function SidebarInner({ mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  const currentCategory = searchParams?.get("category");

  const navigationSections = [
    {
      title: "Vue générale",
      items: [
        {
          name: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
          active: pathname === "/dashboard" || pathname === "/",
        },
      ],
    },
    {
      title: "Gestion des clients",
      items: [
        {
          name: "Tous les clients",
          href: "/clients",
          icon: Users,
          active: pathname === "/clients",
        },
        {
          name: "Ajouter un client",
          href: "/clients/new",
          icon: UserPlus,
          active: pathname === "/clients/new",
        },
      ],
    },
    {
      title: "Dossiers",
      items: [
        {
          name: "Tous les dossiers",
          href: "/cases",
          icon: FolderKanban,
          active: pathname === "/cases" && !currentCategory,
        },
        {
          name: "Dossiers d'études",
          href: "/cases?category=study_abroad",
          icon: GraduationCap,
          active: pathname === "/cases" && currentCategory === "study_abroad",
        },
        {
          name: "Visas touristiques",
          href: "/cases?category=tourist_visa",
          icon: Plane,
          active: pathname === "/cases" && currentCategory === "tourist_visa",
        },
        {
          name: "Voyages & Affaires",
          href: "/cases?category=business_travel",
          icon: Briefcase,
          active: pathname === "/cases" && currentCategory === "business_travel",
        },
      ],
    },
    {
      title: "Organisation",
      items: [
        {
          name: "Documents",
          href: "/documents",
          icon: FileText,
          active: pathname === "/documents",
          badge: "7 à vérifier",
        },
        {
          name: "Rendez-vous",
          href: "/appointments",
          icon: CalendarDays,
          active: pathname === "/appointments",
        },
        {
          name: "Tâches",
          href: "/tasks",
          icon: CheckSquare,
          active: pathname === "/tasks",
          badge: "4",
        },
      ],
    },
    {
      title: "Finances",
      items: [
        {
          name: "Paiements & Reçus",
          href: "/finance/payments",
          icon: CreditCard,
          active: pathname.startsWith("/finance/payments") || pathname.startsWith("/finance/receipts"),
        },
        {
          name: "Dépenses",
          href: "/finance/expenses",
          icon: Receipt,
          active: pathname === "/finance/expenses",
        },
        {
          name: "Rapports financiers",
          href: "/finance",
          icon: BarChart3,
          active: pathname === "/finance",
        },
      ],
    },
    {
      title: "Administration",
      items: [
        {
          name: "Équipe",
          href: "/team",
          icon: UserCog,
          active: pathname === "/team",
        },
        {
          name: "Paramètres",
          href: "/settings",
          icon: Settings,
          active: pathname.startsWith("/settings"),
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-[#022340] border-r border-[#03345e] text-slate-200 transition-all duration-300 ease-in-out
          ${collapsed ? "w-20" : "w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Header / Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#03345e] bg-[#01182c]">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 overflow-hidden"
          >
            {collapsed ? (
              <div className="w-10 h-10 rounded-lg bg-[#023764] flex items-center justify-center font-black text-[#F0FF0A] text-xl border border-[#F0FF0A]/30">
                S
              </div>
            ) : (
              <div className="flex flex-col">
                <Logo variant="onDark" size="sm" showSubtitle={true} />
              </div>
            )}
          </Link>

          {/* Close on mobile */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Collapse on desktop */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#03345e] transition-colors"
            title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-[#F0FF0A]" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Agency Badge Subheader */}
        {!collapsed && (
          <div className="px-4 py-2.5 bg-[#011e37]/70 border-b border-[#03345e]/60 flex items-center gap-2 text-xs">
            <Building2 className="w-3.5 h-3.5 text-[#F0FF0A] shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-white">SELECT Agency</span>
              <span className="text-slate-400 block truncate text-[11px]">
                {mockCurrentUser.agencyName}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Items (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navigationSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {!collapsed && (
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.name : undefined}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      item.active
                        ? "bg-[#023764] text-white shadow-sm font-semibold border-l-4 border-[#F0FF0A]"
                        : "text-slate-300 hover:text-white hover:bg-[#03345e]/60"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        item.active
                          ? "text-[#F0FF0A]"
                          : "text-slate-400 group-hover:text-white"
                      }`}
                    />
                    {!collapsed && (
                      <span className="truncate flex-1">{item.name}</span>
                    )}

                    {!collapsed && item.badge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        {item.badge}
                      </span>
                    )}

                    {collapsed && item.active && (
                      <div className="absolute right-1 top-2 w-1.5 h-1.5 rounded-full bg-[#F0FF0A]" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-[#03345e] bg-[#01182c]">
          <div
            className={`flex items-center gap-3 p-2 rounded-lg bg-[#022340] border border-[#03345e] ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#023764] border border-[#F0FF0A] flex items-center justify-center font-bold text-xs text-[#F0FF0A] shrink-0">
              CN
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {mockCurrentUser.name}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <p className="text-[10px] text-slate-300 truncate">
                    {mockCurrentUser.role}
                  </p>
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                type="button"
                title="Déconnexion"
                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                onClick={() => alert("Simulation de déconnexion")}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <Suspense
      fallback={
        <aside className="fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#022340] border-r border-[#03345e] hidden lg:block" />
      }
    >
      <SidebarInner {...props} />
    </Suspense>
  );
}
