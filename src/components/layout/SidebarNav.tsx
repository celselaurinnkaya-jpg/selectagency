"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { ProBadge } from "@/components/shared/FeatureLocked";
import { NAV_ADMIN, NAV_MAIN, isActive, type NavItem } from "./nav-items";

// Menu inspiré de la référence UNIP : cartes blanches sur fond clair, entrée active en bleu marine.
// L'icône est posée sur une pastille bleu marine avec un pictogramme jaune (couleurs du logo).

function NavLink({ item, active, locked, onNavigate }: { item: NavItem; active: boolean; locked: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "border-navy-800 bg-navy-800 text-white shadow-sm"
          : "border-transparent bg-white text-slate-700 shadow-[0_1px_2px_rgba(2,55,100,0.08)] hover:border-navy-200 hover:text-navy-800",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          active ? "bg-citron-400 text-navy-900" : "bg-navy-800 text-citron-400",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="truncate">{item.label}</span>
      {locked && <ProBadge onNavy={active} className="ml-auto" />}
    </Link>
  );
}

/** `locked` : adresses des entrées réservées à une option non incluse dans la formule (badge « PRO »). */
export function SidebarNav({ onNavigate, locked = [] }: { onNavigate?: () => void; locked?: string[] }) {
  return <NavList current={usePathname()} onNavigate={onNavigate} locked={locked} />;
}

/** Version sans état actif, affichée tant que l'URL courante n'est pas connue. */
export function SidebarNavFallback() {
  return <NavList current={null} locked={[]} />;
}

function NavList({ current, onNavigate, locked }: { current: string | null; onNavigate?: () => void; locked: string[] }) {
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-2">
      {NAV_MAIN.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item, current)} locked={locked.includes(item.href)} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t border-slate-200" />
      {NAV_ADMIN.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item, current)} locked={false} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
