"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, LayoutDashboard, LifeBuoy, ScrollText, Users, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "cn";

// Menu de la console SELECT, sur le modèle du menu de l'espace agence.

const ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Vue d'ensemble", href: "/admin", icon: LayoutDashboard },
  { label: "Agences", href: "/admin/agences", icon: Building2 },
  { label: "Utilisateurs", href: "/admin/utilisateurs", icon: Users },
  { label: "Formules et abonnements", href: "/admin/abonnements", icon: CreditCard },
  { label: "Paiements des abonnements", href: "/admin/paiements", icon: Wallet },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  { label: "Journal", href: "/admin/journal", icon: ScrollText },
];

const isActive = (href: string, pathname: string | null) =>
  !!pathname && (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

export function ConsoleNav({ layout = "sidebar" }: { layout?: "sidebar" | "bar" }) {
  return <ConsoleNavList layout={layout} pathname={usePathname()} />;
}

/** Version sans état actif, affichée tant que l'URL courante n'est pas connue. */
export function ConsoleNavFallback({ layout = "sidebar" }: { layout?: "sidebar" | "bar" }) {
  return <ConsoleNavList layout={layout} pathname={null} />;
}

function ConsoleNavList({ layout, pathname }: { layout: "sidebar" | "bar"; pathname: string | null }) {
  if (layout === "bar") {
    return (
      <nav aria-label="Menu de la console" className="overflow-x-auto border-b border-slate-200 bg-surface px-4 py-2 lg:hidden print:hidden">
        <ul className="flex min-w-max gap-2">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href, pathname) ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium",
                  isActive(item.href, pathname) ? "border-navy-800 bg-navy-800 text-white" : "border-slate-200 bg-white text-slate-700",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Menu de la console" className="flex flex-col gap-2">
      {ITEMS.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "border-navy-800 bg-navy-800 text-white shadow-sm"
                : "border-transparent bg-white text-slate-700 shadow-[0_1px_2px_rgba(2,55,100,0.08)] hover:border-navy-200 hover:text-navy-800",
            )}
          >
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", active ? "bg-citron-400 text-navy-900" : "bg-navy-800 text-citron-400")}>
              <item.icon className="size-4" aria-hidden />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
