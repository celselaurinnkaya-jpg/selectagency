# SELECT Agency — Charte de l'interface

Décisions de la Phase 2. Elles s'appuient sur le logo officiel et sur la capture de référence fournie
(espace étudiant UNIP). Les éléments que la capture ne montrait pas ont été décidés ici, et sont signalés
comme tels.

## Couleurs

| Jeton | Valeur | Origine | Usage |
|---|---|---|---|
| `navy-800` | `#023764` | Fond du logo | En-tête, boutons principaux, titres, entrée de menu active |
| `citron-400` | `#F0FF0A` | Lettrage du logo | Bouton « Nouveau », pastilles d'icônes, soulignement des titres, bandeau démo (variante claire `citron-100`) |
| `surface` | `#F3F5F8` | Référence UNIP | Fond du menu et des panneaux de section |
| Blanc | `#FFFFFF` | Référence UNIP | Fond des pages et des cartes |

Les jetons sont déclarés dans `src/app/globals.css` (`@theme`) et utilisés sous forme de classes
Tailwind (`bg-navy-800`, `text-citron-400`…). Aucune couleur n'est écrite en dur dans les composants.

**Règle de contraste.** Le jaune citron sur blanc est illisible (contraste ≈ 1,1:1). Il s'utilise
uniquement sur fond bleu marine (≈ 11:1), ou en aplat sous un texte bleu marine. Les soulignements
jaunes portent une bordure `citron-600` pour rester visibles sur fond clair.

**Couleurs d'état**, distinctes du jaune de marque et toujours accompagnées d'un libellé :

| Couleur | Signification |
|---|---|
| Vert | Terminé, confirmé, vérifié |
| Orange | Attente du client, à surveiller |
| Rouge | Manquant, en retard, refusé |
| Violet | Organisme extérieur |
| Bleu ciel | Information |

## Logo

Le logo a été extrait du fichier fourni (recadrage et fond rendu transparent), sans redessiner aucune
lettre :

- `public/brand/logo-select-agency-jaune.png` : pour les fonds bleus ;
- `public/brand/logo-select-agency-bleu.png` : pour les fonds clairs ;
- `src/app/icon.png` et `src/app/apple-icon.png` : icône « S » sur fond bleu (onglet du navigateur, écran d'accueil).

Un fichier vectoriel (SVG) reste souhaitable pour l'impression en grand format.

## Typographie

**Rubik**, chargée par `next/font` : ses formes arrondies rappellent le logo et la référence.

- Corps de texte : 14 px. Minimum : 12 px, réservé aux mentions secondaires.
- Champs de saisie : 16 px sur mobile, pour éviter le zoom automatique.

## Mise en page (référence UNIP)

- **Barre supérieure bleu marine** pleine largeur (`AppHeader`) : `bg-navy-800` (`#023764`), logo, nom de l'agence, recherche globale, bouton « Nouveau », menu utilisateur.
- **Menu latéral clair** (`SidebarNav`) : panneau gris `bg-surface` (`#f3f5f8`), cartes blanches avec pastille bleu marine `bg-navy-800` à icône jaune `text-citron-400` ; l'entrée active passe en `border-navy-800 bg-navy-800 text-white` avec pastille jaune `bg-citron-400 text-navy-900`.
- **Bannière de bienvenue** en dégradé bleu `bg-linear-to-r from-navy-900 via-navy-800 to-navy-600 text-white rounded-2xl`, avec le nom de l'utilisateur en `text-citron-400 uppercase`.
- **Sections** (`Section`) en panneaux gris arrondis (`rounded-2xl bg-surface p-4 sm:p-5`), titre bleu marine (`SectionTitle`) souligné d'un trait jaune avec bordure foncée (`border border-citron-600 bg-citron-400`), rappelant le soulignement de « Agency » dans le logo officiel.
- **Tuiles d'accès rapide** (`Tile`) blanches avec pastille d'icône ; la tuile principale (« Nouveau dossier ») est mise en valeur par un dégradé bleu (`bg-linear-to-br from-navy-800 to-navy-600 text-white`).

## Bordures, Arrondis et Ombres

| Élément | Arrondi (`border-radius`) | Bordure (`border`) | Ombre (`box-shadow`) |
|---|---|---|---|
| Sections & Hero | `rounded-2xl` (16px) | Aucune ou `border-transparent` | `shadow-sm` |
| Cartes & StatCards | `rounded-xl` (12px) | `border-transparent` sur `surface`, `border-slate-200` sur blanc | `shadow-[0_1px_3px_rgba(2,55,100,0.1)]` |
| Tuiles d'accès | `rounded-xl` (12px) | `border-transparent` | `shadow-[0_1px_3px_rgba(2,55,100,0.12)]` |
| Boutons & Champs | `rounded-lg` (8px) | `border-transparent` (default) ou `border-citron-500` (accent) | `shadow-xs` / `shadow-2xs` |
| Badges & Pastilles | `rounded-full` (9999px) | `border` (selon le ton 200, ex. `border-emerald-200`) | Aucune |
| Boîtes d'icônes | `rounded-md` (6px) ou `rounded-lg` | Aucune | Aucune |
| États vides / Différés | `rounded-xl` (12px) | `border border-dashed border-slate-300` | Aucune |

## Animations et Interactions

- **Micro-interactions** : `transition` ou `transition-colors` de 150ms à 200ms.
- **Survol des cartes et tuiles** : `hover:ring-2 hover:ring-navy-200` (transition douce sans saut de mise en page).
- **Survol de la tuile accentuée** : `hover:brightness-110`.
- **Clic tactile (boutons)** : `active:not-aria-[haspopup]:translate-y-px` pour un feedback tactile direct.

## Grilles et Responsivité

- **Espacement vertical standard** : `space-y-6`.
- **Accès rapide** : `grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6`.
- **Indicateurs clés (KPIs)** : `grid grid-cols-2 gap-3 lg:grid-cols-4`.
- **Colonnes partagées** : `grid gap-6 xl:grid-cols-2`.
- **Cible tactile minimale** : ≥ 40 px de hauteur (`h-10`, `min-h-11`, `min-h-24`).
- **Mobile (< 768px)** : Remplacement des tableaux horizontaux par des cartes (`Card`) ou listes verticales pour téléphones Android.

## Principes Directeurs

- **Chaque statut a une seule apparence**, définie dans `src/lib/domain/labels.ts` et rendue par `StatusBadge`.
- **Un bouton fonctionne**, ou il est désactivé avec la raison affichée (`PlannedAction`). Jamais de faux succès.
- **Les filtres et les onglets vivent dans l'URL** : ils sont partageables et compatibles avec le bouton retour.
- **Aucun drapeau emoji** : Windows les affiche en lettres. Les pays sont désignés par leur nom via `countryName()`.
- **Format monétaire sans conversion fictive** : Utiliser `formatMoney(minor, currency)`.

