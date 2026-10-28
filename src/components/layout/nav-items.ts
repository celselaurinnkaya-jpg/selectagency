import {
  BarChart3,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Préfixes d'URL qui rendent l'entrée active (fiches de détail comprises). */
  match: string[];
}

// Dix entrées, comme une agence s'organise : le quotidien d'abord, l'administration ensuite.
export const NAV_MAIN: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard, match: ["/dashboard"] },
  { label: "Clients", href: "/clients", icon: Users, match: ["/clients"] },
  { label: "Dossiers", href: "/cases", icon: FolderKanban, match: ["/cases"] },
  { label: "Documents", href: "/documents", icon: FileText, match: ["/documents"] },
  { label: "Rendez-vous", href: "/appointments", icon: CalendarDays, match: ["/appointments"] },
  { label: "Tâches", href: "/tasks", icon: ListChecks, match: ["/tasks"] },
  { label: "Finance", href: "/finance", icon: Wallet, match: ["/finance"] },
  { label: "Rapports", href: "/reports", icon: BarChart3, match: ["/reports"] },
];

export const NAV_ADMIN: NavItem[] = [
  { label: "Équipe", href: "/team", icon: UserCog, match: ["/team"] },
  { label: "Paramètres", href: "/settings", icon: Settings, match: ["/settings"] },
];

export function isActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
