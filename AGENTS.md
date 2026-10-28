<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SELECT Agency — Règle Antigravity du Design System

Tous les composants, pages, formulaires, modales et interfaces créés dans ce projet DOIVENT respecter impérativement le Design System officiel de SELECT Agency établi d'après le Dashboard (`src/app/(app)/dashboard/page.tsx`), la navigation (`AppHeader.tsx`, `SidebarNav.tsx`) et la bibliothèque partagée (`src/components/shared/ui.tsx`).

Consultez également la règle complète dans [`.agents/rules/select-agency-design-system.md`](file:///C:/Users/Lenovo/.gemini/select%20agency/.agents/rules/select-agency-design-system.md).

---

## 1. Principes et Couleurs Officielles

- **Bleu Marine SELECT** (`navy-800` : `#023764`) : Couleur primaire. En-tête `AppHeader`, boutons `default`, entrée de menu active, pastilles d'icônes, titres de sections.
  - Dégradé Hero : `bg-linear-to-r from-navy-900 via-navy-800 to-navy-600 text-white`.
- **Jaune Citron SELECT** (`citron-400` : `#F0FF0A`) : Couleur d'accentuation haute visibilité. Bouton `variant="accent"` (`bg-citron-400 text-navy-900 font-semibold border-citron-500 hover:bg-citron-300`), pastilles d'icônes, soulignement de marque des sections, mise en valeur du nom d'utilisateur dans la bannière hero.
  - ⚠️ **Règle absolue de contraste** : JAMAIS de texte `text-citron-400` sur fond blanc ou gris clair (illisible). Le jaune ne s'utilise QUE sur fond bleu marine (`navy-800`/`navy-900`) ou en fond de bouton sous un texte `text-navy-900`.
- **Fonds & Surfaces** :
  - Corps de page : `bg-white`.
  - Conteneurs de section et fond d'aside : `bg-surface` (`#f3f5f8`).
  - Cartes et tuiles : `bg-white`.
- **Tones Sémantiques** (ne jamais utiliser le jaune citron pour un statut) :
  - `success` (Vert) : `border-emerald-200 bg-emerald-50 text-emerald-800` (validé, encaissé, terminé).
  - `warning` (Orange) : `border-orange-200 bg-orange-50 text-orange-800` (attente client, solde échu, document à vérifier).
  - `danger` (Rouge) : `border-red-200 bg-red-50 text-red-800` (en retard, manquant, refusé).
  - `info` (Bleu ciel) : `border-sky-200 bg-sky-50 text-sky-800` (information, nouveau dossier).
  - `external` (Violet) : `border-violet-200 bg-violet-50 text-violet-800` (attente organisme tiers, consulat, université).
  - `navy` (Bleu marine) : `border-navy-200 bg-navy-50 text-navy-800` (indicateur interne agence).
  - `neutral` (Gris) : `border-slate-200 bg-slate-100 text-slate-700` (archivé, inactif).

---

## 2. Bordures, Arrondis et Ombres

- **Rayons de courbure (`border-radius`)** :
  - `rounded-2xl` (16px) : Conteneurs de section (`Section`) et Hero Banner.
  - `rounded-xl` (12px) : Cartes (`Card`), tuiles (`Tile`), statistiques (`StatCard`).
  - `rounded-lg` (8px) : Boutons (`Button`), champs (`input`, `select`), liens de navigation.
  - `rounded-full` : Badges de statut (`StatusBadge`), pastilles de compteurs.
  - `rounded-md` (6px) : Boîtes d'icônes intégrées.
- **Ombres (`box-shadow`)** :
  - Teinte marine subtile : `shadow-[0_1px_3px_rgba(2,55,100,0.1)]` ou `shadow-[0_1px_2px_rgba(2,55,100,0.08)]`.
  - Pas d'ombres noires lourdes ni de dégradés agressifs.
  - Effet survol : `hover:ring-2 hover:ring-navy-200 transition`.
- **Bordures (`border`)** :
  - Standard : `border-border` (`#e1e6ee`) ou `border-slate-200`.
  - États vides et actions prévues : `border border-dashed border-slate-300`.

---

## 3. Typographie & Composants Obligatoires (`@/components/shared/ui`)

- Police : **Rubik** (`font-sans`).
- Chiffres et montants : toujours `tabular-nums`.
- Titres de section : toujours `SectionTitle` avec soulignement jaune signature :
  `<span aria-hidden className="absolute bottom-0 left-0 h-1.5 w-12 rounded-full border border-citron-600 bg-citron-400" />`.
- **Composants partagés à utiliser obligatoirement** :
  - `PageHeader` : Haut de page avec titre, description, retour arrière et boutons d'action.
  - `Section` & `SectionTitle` : Regroupements thématiques.
  - `Card` : Fiches de données blanches avec ombre marine.
  - `StatCard` : Indicateur KPI avec icône sur pastille marine/citron.
  - `Tile` : Tuiles de raccourcis (`highlight` pour la première action clé).
  - `StatusBadge` : Badges normalisés basés sur `LabelSpec`.
  - `EmptyState` : Écrans sans données (icône, message, bouton d'action).
  - `Notice` : Mises en garde et informations légales.
  - `PlannedAction` : Boutons de fonctions futures (désactivé avec motif visible).
  - `Button` : Variantes standardisées shadcn (`default`, `accent`, `outline`, `secondary`, `ghost`, `destructive`).

---

## 4. Alignements, Grilles et Responsivité

- Espacement standard entre sections : `space-y-6`.
- Hauteur tactile minimale sur mobile : **≥ 40 px** (`h-10`, `min-h-11`, `min-h-24`).
- Grilles responsives :
  - Tuiles d'accès rapide : `grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6`.
  - Cartes KPI : `grid grid-cols-2 gap-3 lg:grid-cols-4`.
  - Blocs divisés : `grid gap-6 xl:grid-cols-2`.
- Tableaux de données : en dessous de `768px` (`md`), remplacer le tableau par une liste de cartes (`Card`) pour une lisibilité parfaite sur smartphone Android.
- Pas de drapeaux emoji : écrire le nom complet du pays via `countryName()`.

