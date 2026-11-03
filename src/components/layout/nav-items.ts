import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Settings,
  Target,
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

// Le quotidien d'abord, l'administration de l'agence ensuite, puis l'aide de l'équipe SELECT.
export const NAV_MAIN: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard, match: ["/dashboard"] },
  { label: "Prospects", href: "/prospects", icon: Target, match: ["/prospects"] },
  { label: "Clients", href: "/clients", icon: Users, match: ["/clients"] },
  { label: "Dossiers", href: "/cases", icon: FolderKanban, match: ["/cases"] },
  { label: "Documents", href: "/documents", icon: FileText, match: ["/documents"] },
  { label: "Services", href: "/services", icon: BriefcaseBusiness, match: ["/services"] },
  { label: "Rendez-vous", href: "/appointments", icon: CalendarDays, match: ["/appointments"] },
  { label: "Tâches", href: "/tasks", icon: ListChecks, match: ["/tasks"] },
  { label: "Finance", href: "/finance", icon: Wallet, match: ["/finance"] },
  { label: "Partenaires", href: "/partners", icon: Handshake, match: ["/partners"] },
  { label: "Rapports", href: "/reports", icon: BarChart3, match: ["/reports"] },
];

export const NAV_ADMIN: NavItem[] = [
  { label: "Équipe", href: "/team", icon: UserCog, match: ["/team"] },
  { label: "Paramètres", href: "/settings", icon: Settings, match: ["/settings"] },
  { label: "Aide et support", href: "/support", icon: LifeBuoy, match: ["/support"] },
];

export function isActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
