import { NAV_FEATURE } from "@/lib/domain/features";
import { getShell } from "@/features/operations/queries";
import { MobileMenu } from "./HeaderMenus";
import { SidebarNav } from "./SidebarNav";

// Menus de l'agence avec le badge « PRO » sur les entrées non incluses dans sa formule (STARTER),
// et sans les entrées que le rôle du membre ne voit pas.

/** « Agent IA » : les conversations contiennent des données personnelles, la lecture seule n'y a pas accès. */
const HIDDEN_FOR_VIEWER = ["/agent-ia"];

async function navState(): Promise<{ locked: string[]; hidden: string[] }> {
  const { locked, member } = await getShell();
  return {
    locked: Object.entries(NAV_FEATURE)
      .filter(([, feature]) => locked.includes(feature))
      .map(([href]) => href),
    hidden: member.role === "viewer" ? HIDDEN_FOR_VIEWER : [],
  };
}

export async function AgencySidebarNav() {
  return <SidebarNav {...await navState()} />;
}

export async function AgencyMobileMenu() {
  return <MobileMenu {...await navState()} />;
}
