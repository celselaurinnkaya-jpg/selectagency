# Règle Antigravity — Design System Officiel SELECT Agency

> Cette règle s'applique impérativement à tous les fichiers et composants créés ou modifiés dans le projet **SELECT Agency**.
> Tout nouveau composant, page, formulaire, modal ou widget doit respecter scrupuleusement les tokens, espacements, animations, bordures et principes d'alignement définis ci-dessous, inspirés directement du Dashboard et de la charte graphique officielle.

---

## 1. Principes Directeurs & Identité Visuelle

1. **Inspiration centrale** : L'interface reprend l'esthétique du tableau de bord (`src/app/(app)/dashboard/page.tsx`), du cadre commun (`src/app/(app)/layout.tsx`), de l'en-tête bleu marine (`AppHeader.tsx`), du menu latéral clair (`SidebarNav.tsx`) et des composants partagés (`src/components/shared/ui.tsx`).
2. **Pas de style ad-hoc** : Ne jamais inventer de nouvelles couleurs hexadécimales en dur ni d'ombres arbitraires. Utiliser exclusivement les classes et tokens Tailwind du projet.
3. **Réutilisation stricte** : Ne jamais recoder une carte, un badge de statut ou un en-tête de section. Importer directement les composants de `@/components/shared/ui`.

---

## 2. Palette Chromatique & Tokens Tailwind

### 2.1 Bleu Marine SELECT (Couleur Maîtresse)
* Fond officiel du logo : `#023764` -> token Tailwind `navy-800`.
* Déclinaisons autorisées :
  * `navy-950` (`#011a30`) : Ombres profondes, contrastes extrêmes.
  * `navy-900` (`#022a4d`) : Début de dégradé hero, textes d'accent.
  * `navy-800` (`#023764`) : **Couleur primaire**. En-tête `AppHeader`, boutons principaux `default`, titres forts, entrée de menu active, pastilles d'icônes.
  * `navy-700` (`#034582`) : États de survol des boutons `default`.
  * `navy-600` (`#0b4f8f`) : Fin de dégradé hero, tuiles interactives.
  * `navy-100` (`#d9e6f2`) : Textes secondaires sur fond navy.
  * `navy-50` (`#eef4fa`) : Fonds de pastilles claires, icônes informatives.
* **Dégradé de bannière Hero (référence Dashboard)** :
  `bg-linear-to-r from-navy-900 via-navy-800 to-navy-600 text-white`

### 2.2 Jaune Citron SELECT (Couleur d'Accentuation)
* Lettrage officiel du logo : `#F0FF0A` -> token Tailwind `citron-400`.
* Usage exclusif :
  * Bouton d'action principale (`variant="accent"`) : `bg-citron-400 text-navy-900 font-semibold border-citron-500 hover:bg-citron-300`.
  * Nom de l'utilisateur dans le Hero de bienvenue (`text-citron-400 uppercase`).
  * Pictogrammes d'icônes sur fond bleu marine (`bg-navy-800 text-citron-400`).
  * Soulignement de marque des titres de section (`SectionTitle`) : trait jaune avec bordure `border-citron-600 bg-citron-400`.
  * Badges de notification sur tuiles (`bg-citron-400 text-navy-900`).
  * Bandeau de démonstration (`citron-100` / `#f8ffb0`).
* ⚠️ **RÈGLE CRITIQUE D'ACCESSIBILITÉ** :
  **JAMAIS de texte jaune `text-citron-400` sur fond blanc ou gris clair** (contraste ≈ 1,1:1 = illisible). Le jaune s'utilise uniquement sur fond bleu marine (`navy-800`/`navy-900`), ou en fond de bouton sous un texte sombre (`text-navy-900`).

### 2.3 Surfaces et Fonds
* Fond principal des pages : `bg-white`.
* Fond de l'aside navigation et des conteneurs de section (`Section`) : `bg-surface` (`#f3f5f8`).
* Fond des cartes, tuiles et fiches : `bg-white`.

### 2.4 Couleurs Sémantiques d'État (Tones)
*Ne jamais utiliser le jaune citron pour un statut.* Utiliser les correspondances sémantiques officielles :
* **Success (Vert)** : `border-emerald-200 bg-emerald-50 text-emerald-800` (dot: `bg-emerald-600`).
  *Usage : Validé par l'agence, payé/encaissé, étape terminée, confirmé.*
* **Warning (Orange)** : `border-orange-200 bg-orange-50 text-orange-800` (dot: `bg-orange-500`).
  *Usage : En attente du client, solde échu, document à vérifier, action requise.*
* **Danger (Rouge)** : `border-red-200 bg-red-50 text-red-800` (dot: `bg-red-600`).
  *Usage : Échéance dépassée, document manquant, visa refusé, anomalie.*
* **Info (Bleu ciel)** : `border-sky-200 bg-sky-50 text-sky-800` (dot: `bg-sky-600`).
  *Usage : Nouveau dossier, information consultative.*
* **External (Violet)** : `border-violet-200 bg-violet-50 text-violet-800` (dot: `bg-violet-600`).
  *Usage : Démarche consulaire, ambassade, université, centre de dépôt tiers.*
* **Neutral (Gris slate)** : `border-slate-200 bg-slate-100 text-slate-700` (dot: `bg-slate-400`).
  *Usage : Archivé, inactif, annulé.*

---

## 3. Typographie et Hiérarchie Visuelle

* Police d'interface : **Rubik** (`font-sans`), aux formes arrondies inspirées du logo.
* **Titre principal de page (`PageHeader`)** :
  `text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl`
* **Titre de section (`SectionTitle`)** :
  `relative pb-2 text-lg font-semibold text-navy-800 sm:text-xl`
  Comporte obligatoirement le soulignement jaune signature :
  `<span aria-hidden className="absolute bottom-0 left-0 h-1.5 w-12 rounded-full border border-citron-600 bg-citron-400" />`
* **Valeurs de statistiques (`StatCard`)** :
  `text-2xl font-semibold tabular-nums` (toujours appliquer `tabular-nums` aux chiffres et montants).
* **Corps de texte** : `text-sm text-slate-600` ou `text-slate-900`.
* **Mentions et libellés secondaires** : `text-xs text-slate-500`.

---

## 4. Bordures, Arrondis et Ombres

### 4.1 Rayons de courbure (`border-radius`)
* **Sections (`Section`) et Hero Banner** : `rounded-2xl` (16px).
* **Cartes (`Card`), StatCards (`StatCard`), Tuiles (`Tile`)** : `rounded-xl` (12px).
* **Boutons (`Button`), Liens de navigation, Champs de saisie** : `rounded-lg` (8px).
* **Badges de statut (`StatusBadge`), Pastilles de compteurs** : `rounded-full` (9999px).
* **Boîtes d'icônes intégrées** : `rounded-md` (6px) ou `rounded-lg` (8px).

### 4.2 Ombres et Bordures
* **Style d'ombre teinté marine** :
  * Cartes et tuiles : `shadow-[0_1px_3px_rgba(2,55,100,0.1)]` ou `shadow-[0_1px_2px_rgba(2,55,100,0.08)]`.
  * En-tête : `shadow-md`.
  * Pas d'ombres noires saturées (`shadow-2xl` noir interdit).
* **Survol interactif** :
  * Au survol d'une carte ou tuile cliquable : appliquer `hover:ring-2 hover:ring-navy-200 transition`.
  * Au survol d'une tuile accentuée : `hover:brightness-110`.
* **Bordures** :
  * Bordures subtiles standard : `border-border` (`#e1e6ee`) ou `border-slate-200`.
  * États vides (`EmptyState`) et actions différées (`PlannedAction`) : `border border-dashed border-slate-300`.

---

## 5. Composants Communs Obligatoires (`src/components/shared/ui.tsx`)

Tout composant doit exploiter les composants partagés existants :

1. **`PageHeader`** : En-tête de toute page avec lien retour `back`, titre `title`, description `description`, et boutons `actions`.
2. **`Section`** : Conteneur de bloc thématique (`rounded-2xl bg-surface p-4 sm:p-5`), recevant un `title` et un `action`.
3. **`SectionTitle`** : Titre avec trait jaune citron en dessous.
4. **`Card`** : Boîte blanche avec ombre marine (`rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]`).
5. **`StatCard`** : Indicateur KPI avec libellé, icône dans pastille `bg-navy-800 text-citron-400`, valeur chiffrée et hint optionnel.
6. **`Tile`** : Tuile d'action rapide. La première tuile d'une liste peut être `highlight` (`bg-linear-to-br from-navy-800 to-navy-600 text-white`).
7. **`StatusBadge`** : Badge pill avec point coloré ou icône, piloté par un objet `LabelSpec` (`label`, `tone`).
8. **`EmptyState`** : Présentation standardisée des listes vides avec icône en pastille `bg-navy-50 text-navy-700`, titre, texte et bouton d'action.
9. **`Notice`** : Encadré d'information ou de recommandation légale/déontologique (`tone="info" | "success" | "warning"`).
10. **`PlannedAction`** : Bouton désactivé avec mention explicite du motif (ex. « Disponible en V1.1 »). Jamais de bouton inactif silencieux ou simulant un faux succès.
11. **`Button`** : Variantes `default` (navy), `accent` (citron avec texte navy), `outline`, `secondary`, `ghost`, `destructive`.

---

## 6. Alignements, Grilles et Responsivité

* **Espacement vertical standard** entre sections : `space-y-6`.
* **Grilles responsives de Dashboard / Pages** :
  * Tuiles rapides : `grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6`
  * Cartes de métriques : `grid grid-cols-2 gap-3 lg:grid-cols-4`
  * Blocs comparatifs : `grid gap-6 xl:grid-cols-2`
  * Cartes financières : `grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3`
* **Ergonomie Mobile & Tactile (Android First)** :
  * Hauteur tactile minimale des boutons et liens : **≥ 40 px** (`h-10`, `min-h-11`, `min-h-24` pour les tuiles).
  * Tableaux : Sur écrans inférieurs à 768 px (`md`), masquer les tableaux horizontaux au profit d'une disposition en cartes (`Card`) ou liste verticale.
  * Pas de drapeaux emoji : Toujours utiliser le libellé complet du pays (via `countryName()`) pour éviter les régressions d'affichage sur Windows/Android.

---

## 7. Règles Fonctionnelles et Éthiques

* **Vérité et traçabilité** : Aucun visa garanti. Ne jamais afficher un résultat externe comme « Accordé » sans justificatif joint.
* **Gestion monétaire** : Toujours utiliser `formatMoney(montantMinor, devise)`. Aucune addition ou conversion automatique fictive entre devises différentes (XAF, XOF, EUR, USD).
* **Dates & Fuseaux** : Toujours formater les dates avec le fuseau horaire de l'agence (`tz`) via `formatDate()` ou `formatRelativeDay()`.
* **Sécurité & Confidentialité** : Numéros de passeport toujours masqués par défaut (`••••1234`).
