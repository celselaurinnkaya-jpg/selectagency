import Link from "next/link";
import { cn } from "cn";

// Sous-menu du module « Agent IA » (WhatsApp officiel de Meta + IA), sur le modèle de celui de la page Tâches.
// Ce module est séparé du WhatsApp manuel (« Préparer un message WhatsApp » des fiches clients et dossiers).

export const AGENT_IA_TABS = [
  { key: "agents", href: "/agent-ia/agents", label: "Support client" },
  { key: "conversations", href: "/agent-ia", label: "Conversations" },
  { key: "connaissances", href: "/agent-ia/connaissances", label: "Connaissances" },
  { key: "modeles", href: "/agent-ia/modeles", label: "Modèles WhatsApp" },
  { key: "statistiques", href: "/agent-ia/statistiques", label: "Statistiques" },
  { key: "connexion", href: "/agent-ia/connexion", label: "Connexion WhatsApp" },
] as const;

export type AgentIaTab = (typeof AGENT_IA_TABS)[number]["key"];

export function AgentIaSubNav({ active }: { active: AgentIaTab }) {
  return (
    <nav aria-label="Sections de l'Agent IA" className="-mt-1 mb-4 flex flex-wrap gap-x-4 text-sm">
      {AGENT_IA_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center font-medium",
            active === tab.key ? "text-navy-800 underline underline-offset-4" : "text-slate-600 hover:text-navy-800",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
