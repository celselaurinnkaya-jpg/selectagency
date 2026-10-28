import { Pills } from "@/components/shared/navigation";

const ITEMS = [
  { key: "agence", label: "Agence", href: "/settings" },
  { key: "workflows", label: "Modèles d'étapes", href: "/settings/workflows" },
  { key: "documents", label: "Pièces et checklists", href: "/settings/documents" },
];

export function SettingsNav({ active }: { active: "agence" | "workflows" | "documents" }) {
  return <Pills label="Sections des paramètres" active={active} items={ITEMS} />;
}
