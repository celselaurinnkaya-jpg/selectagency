import Link from "next/link";
import { cn } from "cn";
import { countWebsiteMessagesToHandle } from "./queries";

// Sous-menu du module « Site web », sur le modèle de celui de l'Agent IA : le site d'un côté, les messages
// reçus par son formulaire « Contact » de l'autre (deux pages séparées).

export const WEBSITE_TABS = [
  { key: "site", href: "/site-web", label: "Site web de l'agence" },
  { key: "messages", href: "/site-web/messages", label: "Messages reçus par le site" },
] as const;

export type WebsiteTab = (typeof WEBSITE_TABS)[number]["key"];

export function WebsiteSubNav({ active, toHandle }: { active: WebsiteTab; toHandle?: number }) {
  return (
    <nav aria-label="Sections du site web" className="-mt-1 mb-4 flex flex-wrap gap-x-4 text-sm">
      {WEBSITE_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 font-medium",
            active === tab.key ? "text-navy-800 underline underline-offset-4" : "text-slate-600 hover:text-navy-800",
          )}
        >
          {tab.label}
          {tab.key === "messages" && toHandle ? (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800" aria-label={`${toHandle} à traiter`}>
              {toHandle}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** Sous-menu avec le nombre de messages encore à traiter. */
export async function WebsiteSubNavWithCount({ active }: { active: WebsiteTab }) {
  return <WebsiteSubNav active={active} toHandle={await countWebsiteMessagesToHandle()} />;
}
