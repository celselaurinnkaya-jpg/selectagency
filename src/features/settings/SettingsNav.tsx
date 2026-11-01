import { Pills } from "@/components/shared/navigation";

const ITEMS = [
  { key: "agence", label: "Agence", href: "/settings" },
  { key: "factures", label: "Factures", href: "/settings/invoices" },
  { key: "workflows", label: "Modèles d'étapes", href: "/settings/workflows" },
  { key: "documents", label: "Pièces et checklists", href: "/settings/documents" },
  { key: "abonnement", label: "Abonnement", href: "/settings/billing" },
];

export function SettingsNav({ active }: { active: "agence" | "factures" | "workflows" | "documents" | "abonnement" }) {
  return <Pills label="Sections des paramètres" active={active} items={ITEMS} />;
}
