import type { Metadata } from "next";
import { Card, Notice, PageHeader, Section } from "@/components/shared/ui";
import { APPLICANT_TAGS, CATEGORY_LABELS } from "@/lib/domain/labels";
import { countryName } from "@/lib/countries";
import { CHECKLIST_DISCLAIMER, CHECKLISTS, DOCUMENT_TYPES, documentType } from "@/features/documents/checklists";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Pièces et checklists" };

export default function DocumentSettingsPage() {
  const categories = [...new Set(DOCUMENT_TYPES.map((t) => t.category))];
  return (
    <>
      <PageHeader
        title="Pièces et checklists"
        description="La liste des pièces d'un dossier est construite à partir de son type de projet, de sa destination et du profil du demandeur. Aucune liste n'est imposée à tous."
      />
      <SettingsNav active="documents" />
      <div className="space-y-6">
        <Section title="Checklists">
          <div className="grid gap-3 md:grid-cols-2">
            {CHECKLISTS.map((checklist) => (
              <Card key={checklist.key}>
                <p className="font-medium text-navy-800">{checklist.name}</p>
                <p className="text-xs text-slate-500">
                  {CATEGORY_LABELS[checklist.category]}
                  {checklist.destinations ? ` · ${checklist.destinations.map(countryName).join(", ")}` : " · toutes destinations"}
                  {checklist.tags && ` · ${checklist.tags.map((t) => APPLICANT_TAGS[t]).join(", ")}`}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {checklist.items.map((item) => (
                    <li key={item.code} className="flex justify-between gap-2">
                      <span className="text-slate-800">{documentType(item.code).label}</span>
                      <span className={item.required ? "text-navy-800" : "text-slate-500"}>{item.required ? "Obligatoire" : "Facultatif"}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Types de documents">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Card key={category}>
                <p className="font-medium text-navy-800">{category}</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {DOCUMENT_TYPES.filter((t) => t.category === category).map((t) => (
                    <li key={t.code}>
                      {t.label}
                      {t.hasExpiry && <span className="text-xs text-slate-500"> · date d&apos;expiration suivie</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Section>
        <Notice title="Listes indicatives">
          {CHECKLIST_DISCLAIMER} La modification des listes depuis cette page est prévue avec la base de données.
        </Notice>
      </div>
    </>
  );
}
