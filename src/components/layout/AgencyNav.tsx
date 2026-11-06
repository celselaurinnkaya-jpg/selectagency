import { NAV_FEATURE } from "@/lib/domain/features";
import { getShell } from "@/features/operations/queries";
import { MobileMenu } from "./HeaderMenus";
import { SidebarNav } from "./SidebarNav";

// Menus de l'agence avec le badge « PRO » sur les entrées non incluses dans sa formule (STARTER).

async function lockedHrefs(): Promise<string[]> {
  const { locked } = await getShell();
  return Object.entries(NAV_FEATURE)
    .filter(([, feature]) => locked.includes(feature))
    .map(([href]) => href);
}

export async function AgencySidebarNav() {
  return <SidebarNav locked={await lockedHrefs()} />;
}

export async function AgencyMobileMenu() {
  return <MobileMenu locked={await lockedHrefs()} />;
}
