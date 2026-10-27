# SELECT Agency — Plan d'implémentation

> **La gestion intelligente des agences de voyages.**
> Version 1.0 — 27 octobre 2026 — Statut : **en attente de validation** (Phase 1)
> Aucun code applicatif n'a été écrit à ce stade. Ce document est la référence de toutes les phases suivantes ; il sera mis à jour à chaque décision validée.

---

## Sommaire

1. [Synthèse](#1-synthèse)
2. [Analyse du besoin](#2-analyse-du-besoin)
3. [Périmètre : lancement et évolutions](#3-périmètre--lancement-et-évolutions)
4. [Architecture technique](#4-architecture-technique)
5. [Organisation du projet](#5-organisation-du-projet)
6. [Modèle de données Supabase](#6-modèle-de-données-supabase)
7. [Rôles et permissions](#7-rôles-et-permissions)
8. [Workflows métier des dossiers](#8-workflows-métier-des-dossiers)
9. [Règles métier par module](#9-règles-métier-par-module)
10. [Routes et pages](#10-routes-et-pages)
11. [Identité visuelle et composants UI](#11-identité-visuelle-et-composants-ui)
12. [Sécurité](#12-sécurité)
13. [Stratégie de tests](#13-stratégie-de-tests)
14. [Phases d'implémentation et critères de validation](#14-phases-dimplémentation-et-critères-de-validation)
15. [Déploiement](#15-déploiement)
16. [Intégrations futures](#16-intégrations-futures)
17. [Risques et parades](#17-risques-et-parades)
18. [Décisions à valider et éléments à fournir](#18-décisions-à-valider-et-éléments-à-fournir)

---

## 1. Synthèse

**Ce que nous construisons.** Un SaaS multi-agences (multi-tenant). Chaque agence dispose d'un espace isolé pour gérer ses clients et leurs dossiers (visa, études, voyages, démarches administratives) : documents, rendez-vous, tâches, paiements et communications. Le tableau de bord est alimenté uniquement par les données réelles de l'agence.

**Principes directeurs.** Ils arbitrent toutes les décisions de ce plan.

1. **L'isolation des données d'abord.** Chaque ligne appartient à une agence. La base de données (RLS) est la barrière finale, pas l'interface.
2. **Vérité et traçabilité.** Le système n'affirme jamais un fait externe (rendez-vous consulaire, admission, visa) sans justificatif. Toute modification importante est journalisée.
3. **Configurable sans code.** Workflows, checklists, prestations, moyens de paiement, modèles de messages, devise et fuseau horaire sont des données, pas du code.
4. **Simple et léger.** Formulaires courts, vocabulaire constant, pages légères pour les téléphones Android et les connexions instables.
5. **Honnêteté technique.** Une intégration non configurée est affichée comme « non configurée ». Un envoi simulé est étiqueté « simulé ».

**Décisions structurantes** (détaillées en [§4.8](#48-décisions-darchitecture-adr)) :

- base partagée avec une colonne `organization_id` et des politiques RLS ;
- écritures composées exécutées dans des fonctions PostgreSQL transactionnelles ;
- modèle de workflow **copié dans chaque dossier** au moment de sa création ;
- montants stockés en entiers (unités mineures), avec **une devise de facturation par dossier** ;
- fichiers dans un bucket privé, téléchargés par des liens signés de courte durée ;
- numéro de passeport chiffré au niveau applicatif ;
- journal d'audit alimenté par des triggers de base de données.

---

## 2. Analyse du besoin

### 2.1 Le cœur fonctionnel, par ordre de valeur

| Rang | Module | Pourquoi il est central |
|---|---|---|
| 1 | **Dossiers + workflow** | C'est le « dossier numérique unique ». Tout le reste s'y rattache. |
| 2 | **Documents et checklists** | La première source de retard : les pièces manquantes ou à corriger. |
| 3 | **Finance** (acomptes, soldes, reçus) | La confiance entre l'agence et son client, et la santé de l'agence. |
| 4 | **Rendez-vous, échéances, tâches** | Éviter les échéances manquées et répartir le travail. |
| 5 | **Communication** | Sortir l'historique de WhatsApp et des appels pour le rattacher au dossier. |
| 6 | **Tableau de bord, rapports** | La visibilité du responsable. Ce module agrège les autres, il est donc construit en dernier. |

### 2.2 Les questions auxquelles l'application répond immédiatement

| Ce que l'agence doit savoir | Où | Règle de calcul |
|---|---|---|
| Qui sont ses clients | `/clients` | Clients non archivés |
| Quels dossiers sont en cours | Tableau de bord, `/cases` | `status = active` |
| Quels documents manquent | Tableau de bord, `/documents`, onglet Documents | Exigences obligatoires `not_received` ou `to_correct` sur les dossiers actifs |
| Quels dossiers nécessitent une intervention | Bloc « À traiter » | Prochaine action échue, documents à vérifier, étape agence en retard |
| Quels rendez-vous approchent | Tableau de bord, `/appointments` | `starts_at` dans les 7 prochains jours (durée configurable) |
| Quels clients relancer | Bloc « À relancer » | Pièces manquantes depuis plus de N jours, solde échu, étape client en attente |
| Quels paiements ont été effectués | `/finance` | Paiements non annulés |
| Quels soldes restent à payer | `/finance`, fiche dossier | Prestations − encaissements nets, **par devise** |
| Quels dossiers sont terminés | `/cases?status=closed` | `status = closed` |
| Quelles tâches faire aujourd'hui | `/tasks`, tableau de bord | `due_at` aujourd'hui dans le fuseau de l'agence |

### 2.3 Dépendances entre modules

```
Authentification ─► Agences & membres (rôles) ─► Paramètres & référentiels
                                                   (devise, moyens de paiement, types de documents,
                                                    checklists, modèles de workflow, prestations, modèles de messages)
                                                          │
                                                          ▼
                                                       Clients
                                                          │
                                                          ▼
                                            Dossiers (+ étapes de workflow)
                    ┌──────────────┬──────────────┬──────┴───────┬──────────────┐
                    ▼              ▼              ▼              ▼              ▼
               Documents    Rendez-vous &      Tâches        Finance      Communications
                            échéances                  (prestations,
                                                        paiements,
                                                        reçus, dépenses)
                    └──────────────┴──────────────┴──────┬───────┴──────────────┘
                                                          ▼
                                       Tableau de bord · Rapports · Fil d'activité

Transverse : journal d'audit · notifications · rappels planifiés · i18n · gestion des erreurs
```

Conséquence sur l'ordre de construction : socle → agences et rôles → paramètres → clients → dossiers et workflow → documents → rendez-vous → tâches → finance → communications → tableau de bord et rapports.

### 2.4 Hypothèses de travail

- Une agence compte de 1 à 20 utilisateurs et quelques milliers de clients au maximum. Un dossier contient en général 5 à 30 documents. Une instance Supabase Pro suffit pour les premières centaines d'agences.
- Un utilisateur appartient en général à une seule agence. Le schéma en accepte plusieurs.
- **Un dossier = un demandeur**, parce que chaque décision de visa est individuelle. Une famille correspond à plusieurs dossiers liés (regroupement prévu en V1.1).
- Pas de portail client au lancement : les clients ne se connectent pas. La communication passe par e-mail et WhatsApp.
- Interface en français au lancement, architecture prête pour l'anglais.
- SELECT Agency émet des **reçus internes**, pas des factures fiscales certifiées (voir les risques au [§17](#17-risques-et-parades)).
- Les agences sont **responsables de traitement** des données de leurs clients. SELECT Agency est **sous-traitant**.

### 2.5 Vocabulaire produit (constant dans toute l'interface)

| Terme affiché | Signification |
|---|---|
| **Client** | Personne accompagnée par l'agence. Dans un dossier d'études, elle peut être libellée « candidat ». |
| **Dossier** | Un projet d'un client : visa, études, voyage, démarche. |
| **Étape** | Position du dossier dans son workflow. |
| **Statut du dossier** | Actif, En pause, Annulé, Clôturé. Indépendant de l'étape. |
| **Conseiller** | Membre de l'équipe responsable du dossier. |
| **Prestation** | Montant convenu : frais de l'agence ou montant destiné à un tiers. |
| **Paiement / Reçu** | Somme reçue du client et justificatif émis par l'agence. |
| **Échéance** | Date limite (candidature, transmission de pièces). |
| **Rendez-vous** | Rencontre ou convocation datée. |
| **Vérifié par l'agence** | Contrôle interne, **jamais** une validation officielle. |

---

## 3. Périmètre : lancement et évolutions

| Module | **Lancement (MVP)** | **V1.1** (après les retours des agences pilotes) | **V2 et au-delà** |
|---|---|---|---|
| Comptes et agences | Inscription par e-mail avec confirmation, création d'agence, invitations, 5 rôles, mot de passe oublié, déconnexion | MFA (TOTP) pour propriétaires et administrateurs, export complet des données de l'agence | Connexion Google/Microsoft, connexion par SMS, agences multi-succursales |
| Clients | Fiche complète, contacts, consentements, recherche, filtres, archivage, alerte doublons | Fusion manuelle assistée, import CSV/Excel | Portail client |
| Dossiers | 6 catégories, workflows configurables, étapes, statuts, priorités, prochaine action, historique, notes | Co-conseillers, dossiers groupés (famille, groupe) | Bibliothèque de modèles partagée |
| Documents | Téléversement sécurisé, versions, statuts, checklists configurables, dates d'expiration, demande de nouvelle version | Téléversement reprenable, lien d'envoi sécurisé pour le client, analyse antivirus | Lecture assistée (OCR, zone MRZ) avec validation humaine |
| Rendez-vous et échéances | Vue liste et vue mois, types, rappels internes (in-app et e-mail) | Export ICS, rappels automatiques aux clients | Synchronisation Google/Outlook |
| Tâches | Création, attribution, échéances, retards, tâches générées par le workflow | Règles d'automatisation configurables | — |
| Finance | Prestations (frais agence / montants tiers), paiements manuels (espèces, virement, mobile money), affectations, soldes, reçus PDF, remboursements, dépenses, rapports par devise | **Commissions**, TVA configurable, exports comptables, caisse journalière par agent | Paiement en ligne (agrégateurs, mobile money), facturation certifiée selon le pays |
| Communication | Modèles, e-mail via le fournisseur configuré, WhatsApp « clic pour discuter » (envoi manuel journalisé), historique, consentements | Relances automatiques par e-mail | API WhatsApp Business, SMS |
| Tableau de bord et rapports | Indicateurs réels, filtres, graphiques, état vide, rapports opérationnels et financiers, export CSV | Export PDF, rapports envoyés automatiquement | Prévisions |
| Plateforme SELECT | Landing, tarifs, pages légales, période d'essai, activation manuelle | Console d'administration interne, limites par formule | Facturation automatique de l'abonnement |
| Transverse | Français, PWA installable, brouillons locaux, audit, mobile-first | Anglais, coquille hors ligne (Service Worker) | Mode hors ligne complet, application native si la PWA ne suffit pas |

**Pourquoi les commissions passent en V1.1.** Leur modèle varie beaucoup d'une agence à l'autre : commission reçue d'un établissement, d'un assureur ou d'une compagnie, ou commission versée à un apporteur d'affaires. Il faut l'observer chez les agences pilotes avant de le figer. Le schéma financier est conçu pour l'accueillir sans refonte.

---

## 4. Architecture technique

### 4.1 Stack

Les versions exactes sont **vérifiées au moment de l'installation** (Phase 0) et consignées dans `docs/adr/`.

| Domaine | Choix | Justification |
|---|---|---|
| Framework | **Next.js, dernière version stable** (15.x ou 16.x), App Router | Next.js 14 est en fin de cycle. Les versions récentes apportent React 19 (`useActionState`, `useOptimistic`), un cache explicite et la compatibilité actuelle de shadcn/ui et de Tailwind v4. L'App Router est conservé. |
| UI | React 19, **Tailwind CSS v4**, **shadcn/ui**, **Lucide React** | Composants accessibles (Radix) dont nous possédons le code, thème par variables CSS |
| Formulaires | **React Hook Form** + **Zod** | Mêmes schémas Zod côté client et côté serveur |
| Tableaux | TanStack Table (headless) | Pagination, tri et filtres côté serveur ; rendu en cartes sur mobile |
| Graphiques | Recharts via les charts shadcn/ui, **chargés à la demande** | Pas de coût JavaScript hors du tableau de bord et des rapports |
| Dates et fuseaux | date-fns + `@date-fns/tz`, `Intl` | Fuseau de l'agence, formats français |
| Téléphones | libphonenumber-js | Normalisation E.164, pays par défaut de l'agence |
| Internationalisation | next-intl | Compatible Server Components, français d'abord |
| PDF | @react-pdf/renderer (runtime Node) | Reçus générés côté serveur |
| E-mails | React Email + fournisseur derrière un adaptateur (Resend recommandé) | Changement de fournisseur possible sans toucher au métier |
| Données | **Supabase** : PostgreSQL, Auth, Storage, Cron, Edge Functions, via `@supabase/ssr` | Demandé ; RLS native |
| Tests | Vitest, Testing Library, **pgTAP** (`supabase test db`), **Playwright**, axe-core | Toutes les couches, y compris les politiques RLS |
| Qualité | TypeScript strict (+ `noUncheckedIndexedAccess`), ESLint, Prettier, gitleaks | — |
| Supervision | Sentry, avec masquage des données personnelles | Erreurs de production sans fuite de données |
| Outillage | pnpm, Node.js LTS (version supportée par Vercel), GitHub Actions | — |

### 4.2 Vue d'ensemble

```
 Navigateur (Android, tablette, ordinateur)
   │  HTML streamé (Server Components) + JavaScript minimal (Client Components)
   ▼
 Vercel — Next.js (région cdg1, Paris)
   ├─ proxy / middleware : rafraîchit la session, redirige les visiteurs non connectés
   │                        (confort d'usage uniquement, jamais la seule protection)
   ├─ Server Components  : lectures avec le client Supabase de l'utilisateur → RLS appliquée
   ├─ Server Actions     : authentification → permission → Zod → service → requête ou RPC Postgres
   └─ Route Handlers     : PDF des reçus, téléchargements journalisés, exports CSV, webhooks futurs
   ▼
 Supabase (région eu-west-3, Paris)
   ├─ Auth      : e-mail et mot de passe, SMTP personnalisé, modèles d'e-mails en français
   ├─ Postgres  : tables + RLS + fonctions RPC + triggers d'audit + vues « security_invoker »
   ├─ Storage   : bucket privé « documents » (politiques RLS, URLs signées courtes)
   └─ Cron (pg_cron) + Edge Functions : rappels, expirations, nettoyage
   ▼
 Fournisseurs externes, derrière des adaptateurs et désactivés tant qu'ils ne sont pas configurés :
   e-mail (MVP) · WhatsApp Business · SMS · paiement en ligne (futurs)
```

### 4.3 Modèle d'exécution

| Opération | Mécanisme | Règle |
|---|---|---|
| **Lecture** | Server Component → `features/<module>/queries.ts` → client Supabase de l'utilisateur | La RLS s'applique. Colonnes listées explicitement (jamais `select *`). Pagination et filtres côté serveur, dans l'URL. |
| **Écriture simple** | Server Action → `requirePermission()` → `schema.parse()` → `update` avec verrou optimiste | Contrôle de `version` : en cas de conflit, le message indique « modifié par quelqu'un d'autre ». |
| **Écriture composée** | Server Action → **RPC PostgreSQL** | Une transaction atomique : créer un dossier, enregistrer un paiement, changer d'étape. Le client JavaScript de Supabase ne gère pas de transaction. |
| **Tâches planifiées** | pg_cron → fonction SQL ou Edge Function | Rappels toutes les 15 minutes, expirations et nettoyage une fois par jour |

**Règle des RPC.**

- Par défaut, les RPC sont `SECURITY INVOKER` : la RLS s'applique normalement.
- Une RPC qui modifie une table **sans politique d'écriture directe** (paiements, étapes, membres) est `SECURITY DEFINER`. Elle doit alors :
  - vérifier l'appartenance et le rôle dès sa première instruction ;
  - fixer `search_path = ''` ;
  - être révoquée pour `anon` ;
  - être testée par pgTAP au même titre que les politiques.

**Format de retour uniforme des Server Actions.**

```ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
```

Les erreurs PostgreSQL sont converties en messages compréhensibles. Le détail technique reste dans les journaux serveur, sous un identifiant de requête.

**Clé secrète Supabase.** Elle n'apparaît que dans `src/lib/supabase/admin.ts` (marqué `server-only`). Usages autorisés et listés : jobs planifiés, purge de fichiers dans le cadre de la rétention. Aucun parcours utilisateur ne l'utilise. Les invitations passent par notre propre table et une RPC, pas par l'API d'administration.

### 4.4 Multi-tenant

- **Stratégie retenue** : une base, un schéma, une colonne `organization_id NOT NULL` sur chaque table métier, la RLS sur toutes les tables exposées.
  - Rejeté : un schéma ou une base par agence. Coût d'exploitation et de migration disproportionné pour des PME.
- **Cohérence entre tables** : chaque table parente porte `UNIQUE (organization_id, id)`, et les enfants y sont reliés par des **clés étrangères composites**, par exemple `travel_cases (organization_id, client_id) → clients (organization_id, id)`. La base rend ainsi impossible un dossier rattaché au client d'une autre agence, même en cas de bug applicatif.
- **Agence active** : stockée dans un cookie `httpOnly` et revalidée côté serveur contre `organization_members` à chaque requête. Pas de slug dans l'URL, puisque la plupart des utilisateurs n'ont qu'une agence. Les identifiants étant des UUID, `/cases/[id]` reste non ambigu.
- **Fonctions d'aide RLS** dans un schéma `private` non exposé par l'API : `private.is_member(org)`, `private.has_role(org, roles)`, `private.can_access_case(...)`, `private.can_access_client(...)`, `private.can_access_document(...)`. Elles appellent `(select auth.uid())`, que PostgreSQL n'évalue qu'une fois par requête.
- **Ressource d'une autre agence** : la RLS ne renvoie rien, l'application répond `notFound()` (404 et non 403, pour ne pas révéler son existence).

### 4.5 Intégrations par adaptateurs

```ts
// src/lib/integrations/email/types.ts
export interface EmailProvider {
  readonly id: 'resend' | 'console';
  isConfigured(): boolean;
  send(message: OutboundEmail): Promise<SendResult>;
}

export type SendResult =
  | { status: 'sent'; providerMessageId: string }   // accepté par le fournisseur (pas « délivré »)
  | { status: 'simulated' }                         // développement uniquement, affiché comme tel
  | { status: 'failed'; error: string };
```

- Le fournisseur est choisi par variable d'environnement. Le fournisseur `console` (simulation) est **refusé au démarrage en production**.
- Fournisseur absent en production : `isConfigured()` renvoie `false`, l'interface affiche « E-mail non configuré », et le bouton d'envoi est remplacé par un lien vers la configuration.
- Le même schéma s'applique à `MessagingProvider` (WhatsApp, SMS) et `PaymentProvider` (futurs).
- Webhooks futurs : `/api/webhooks/<fournisseur>`, signature vérifiée, événements stockés de façon idempotente (`webhook_events`).

### 4.6 Performance et connectivité limitée

| Mesure | Détail |
|---|---|
| Budget | JavaScript initial inférieur à environ 200 Ko compressés par route applicative ; LCP inférieur à 2,5 s sur profil mobile 4G lente simulée ; Lighthouse mobile ≥ 85 en performance |
| Rendu serveur par défaut | Client Components réservés aux interactions (formulaires, menus, graphiques) |
| Pagination serveur | 20 lignes par page, filtres dans l'URL (partageables, compatibles avec le bouton retour) |
| Chargement différé | Graphiques, calendrier, générateur de PDF |
| Polices | `next/font`, auto-hébergées, sous-ensemble latin |
| Images | Les photos de documents prises au téléphone sont **compressées dans le navigateur** avant envoi (redimensionnement, JPEG/WebP). Les PDF sont envoyés tels quels. |
| Brouillons | Sauvegarde automatique des formulaires longs dans `localStorage`, **sans les champs sensibles** (passeport, montants), expiration 7 jours, effacement à la déconnexion. Bandeau « Brouillon restauré ». |
| Coupure réseau | Bandeau « Connexion perdue — votre saisie est conservée ». Nouvel essai possible sans doublon grâce aux clés d'idempotence. |
| PWA | Manifeste et icônes : installable sur Android. **Aucune donnée métier ni aucun document en cache local.** |

### 4.7 Pays, devises, langues, fuseaux

Rien n'est codé en dur par pays. Le pays choisi à la création de l'agence ne fait que **proposer** des valeurs par défaut, toutes modifiables.

| Pays | Devise proposée | Fuseau(x) | Indicatif |
|---|---|---|---|
| Cameroun | XAF | Africa/Douala (UTC+1) | +237 |
| Côte d'Ivoire | XOF | Africa/Abidjan (UTC+0) | +225 |
| Sénégal | XOF | Africa/Dakar (UTC+0) | +221 |
| Bénin | XOF | Africa/Porto-Novo (UTC+1) | +229 |
| Togo | XOF | Africa/Lome (UTC+0) | +228 |
| RD Congo | CDF et USD (usage courant) | **Deux fuseaux** : Africa/Kinshasa (UTC+1), Africa/Lubumbashi (UTC+2) | +243 |
| Nigeria | NGN | Africa/Lagos (UTC+1) | +234 |
| Ghana | GHS | Africa/Accra (UTC+0) | +233 |

- **Devises** : table de référence `currencies` (code ISO 4217, nombre de décimales). XAF et XOF ont **0 décimale** ; NGN, GHS, USD, EUR et CDF en ont 2. Affichage via `Intl.NumberFormat('fr-FR', { style: 'currency', currency })`. Une devise étrangère est toujours affichée avec son code.
- **Moyens de paiement** : liste configurable par agence. Exemples proposés selon le pays : Orange Money et Wave (Sénégal, Côte d'Ivoire), MTN MoMo et Orange Money (Cameroun), M-Pesa et Airtel Money (RD Congo). Ces listes restent à valider avec des agences de chaque pays.
- **Identifiants légaux** sur les reçus : liste libre de couples libellé/valeur (par exemple RCCM, NIU, IFU, NCC, NINEA selon le pays).
- **Téléphones** : libphonenumber-js doit être tenu à jour, car les plans de numérotation changent (par exemple le passage du Bénin aux numéros à 10 chiffres).
- **Langues** : textes dans `messages/fr.json`. Les énumérations en base sont des clés anglaises stables, traduites à l'affichage. Une langue préférée est enregistrée par client pour les modèles de messages.
- **Dates** : `timestamptz` (UTC) en base, affichage dans le fuseau de l'agence. Un fuseau spécifique peut être saisi sur un rendez-vous (convocation dans une autre ville).

### 4.8 Décisions d'architecture (ADR)

Chaque décision fera l'objet d'un fichier `docs/adr/NNNN-titre.md`.

| # | Décision | Alternative écartée et raison |
|---|---|---|
| 001 | Multi-tenant : base partagée, `organization_id` et RLS | Schéma ou base par agence : trop coûteux à opérer et à migrer |
| 002 | Next.js en dernière version stable avec React 19 | Next.js 14 : en fin de support, moins bien compatible avec shadcn/ui et Tailwind v4 |
| 003 | Lectures par Server Components ; écritures par Server Actions ; écritures composées par RPC transactionnelles | Écritures en plusieurs appels successifs : risque d'états incohérents |
| 004 | Aucune clé secrète dans les parcours utilisateurs | Contourner la RLS « pour aller plus vite » : interdit par le cahier des charges |
| 005 | Workflow : étapes ordonnées + transitions explicites + étapes de résultat, **copiées dans chaque dossier** | Moteur BPMN générique : trop complexe pour les utilisateurs et pour le MVP |
| 006 | Montants en `bigint` (unités mineures) avec code devise ; une devise de facturation par dossier ; aucune somme entre devises | Nombres flottants ou conversion automatique : erreurs d'arrondi, taux fictifs |
| 007 | Documents : bucket privé, envoi direct vers Storage par URL signée d'envoi, téléchargement par URL signée de 60 secondes via une route journalisée | Faire transiter les fichiers par les fonctions Vercel : corps de requête limité à 4,5 Mo |
| 008 | Données d'identité dans une table séparée ; numéro de passeport chiffré (AES-256-GCM, clé côté serveur) avec 4 derniers caractères en clair pour l'affichage | Colonnes dans `clients` : exposées dans les listes, accès trop large |
| 009 | Agence active dans un cookie revalidé côté serveur | Slug dans l'URL : complexité inutile pour des utilisateurs mono-agence |
| 010 | Audit par triggers PostgreSQL | Audit dans le code applicatif : contournable, oublis possibles |
| 011 | next-intl, français d'abord, énumérations en clés anglaises | Textes en dur : ajout de l'anglais coûteux |
| 012 | Tâches planifiées avec Supabase Cron (pg_cron) | Vercel Cron : fréquence limitée selon la formule |
| 013 | Intégrations derrière des adaptateurs avec un état « non configuré » explicite | Appels directs aux fournisseurs : fausses intégrations, couplage fort |
| 014 | Hébergement à Paris (Supabase eu-west-3, Vercel cdg1) | Région éloignée : latence. Supabase ne propose pas de région en Afrique à ce jour ; l'encadrement des transferts de données hors du pays est à faire valider juridiquement. |
| 015 | Données fictives de démonstration derrière une interface de dépôt (_repository_) identique à l'implémentation Supabase | Données fictives dispersées dans les composants : travail à refaire en Phase 5 |

---

## 5. Organisation du projet

```
select-agency/
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/                 # Pages publiques : layout vitrine
│  │  │  ├─ page.tsx                  # /
│  │  │  ├─ pricing/  privacy/  terms/
│  │  ├─ (auth)/                      # Layout centré, sans sidebar
│  │  │  ├─ login/  signup/  forgot-password/  reset-password/
│  │  ├─ auth/confirm/route.ts        # Vérification des liens Supabase (e-mail, réinitialisation)
│  │  ├─ invite/[token]/page.tsx      # Acceptation d'invitation
│  │  ├─ onboarding/page.tsx          # Création de l'agence (connecté, sans agence)
│  │  ├─ (app)/                       # Espace authentifié : sidebar + barre supérieure
│  │  │  ├─ layout.tsx                # Charge la session + l'agence active (garde serveur)
│  │  │  ├─ dashboard/
│  │  │  ├─ clients/  (page, new/, [id]/, [id]/edit/)
│  │  │  ├─ cases/    (page, new/, [id]/, [id]/edit/)
│  │  │  ├─ documents/  appointments/  tasks/
│  │  │  ├─ finance/  (page, payments/, expenses/, receipts/[id]/)
│  │  │  ├─ reports/  team/  account/
│  │  │  └─ settings/ (page, workflows/, workflows/[id]/, documents/, services/,
│  │  │               finance/, messages/, notifications/, data/, billing/)
│  │  ├─ api/
│  │  │  ├─ documents/[id]/download/route.ts   # Contrôle d'accès → audit → redirection vers l'URL signée
│  │  │  ├─ receipts/[id]/pdf/route.ts
│  │  │  └─ exports/[report]/route.ts          # CSV
│  │  ├─ manifest.ts  robots.ts  sitemap.ts
│  │  ├─ error.tsx  not-found.tsx  global-error.tsx
│  ├─ features/                       # Modules métier (tranches verticales)
│  │  ├─ clients/
│  │  │  ├─ components/               # Composants propres au module
│  │  │  ├─ schemas.ts                # Zod (partagé client/serveur)
│  │  │  ├─ queries.ts                # Lectures (server-only)
│  │  │  ├─ actions.ts                # 'use server' : fines, appellent le service
│  │  │  ├─ service.ts                # Règles métier
│  │  │  └─ repository/ (types.ts, supabase.ts, mock.ts)
│  │  ├─ cases/  workflows/  documents/  appointments/  tasks/
│  │  ├─ finance/  communications/  team/  reports/  dashboard/  settings/
│  ├─ components/
│  │  ├─ ui/                          # shadcn/ui (générés, puis adaptés à la charte)
│  │  ├─ layout/                      # AppShell, Sidebar, Topbar, PageHeader, MobileNav
│  │  └─ shared/                      # DataTable, StatusBadge, EmptyState, MoneyDisplay…
│  ├─ lib/
│  │  ├─ supabase/ (server.ts, browser.ts, admin.ts, proxy.ts)
│  │  ├─ auth/ (session.ts, permissions.ts, guards.ts, active-organization.ts)
│  │  ├─ money/  dates/  phone/  crypto/  csv/  errors/  idempotency/
│  │  ├─ i18n/
│  │  └─ integrations/ (email/, messaging/, payments/)
│  ├─ types/database.types.ts         # Généré par `supabase gen types`
│  ├─ env.ts                          # Validation Zod des variables d'environnement
│  └─ proxy.ts                        # (middleware.ts avant Next.js 16)
├─ messages/fr.json
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                     # Versionnées, jamais modifiées une fois appliquées
│  ├─ tests/                          # pgTAP : RLS, triggers, RPC
│  ├─ functions/                      # Edge Functions (rappels, e-mails planifiés)
│  └─ seed.sql                        # Développement uniquement : 2 agences fictives, 1 utilisateur par rôle
├─ tests/
│  ├─ unit/  integration/  e2e/  fixtures/
├─ docs/
│  ├─ PLAN_IMPLEMENTATION.md  SECURITY.md  DEPLOYMENT.md
│  ├─ adr/  design/
├─ .github/workflows/ci.yml
├─ .env.example
└─ README.md
```

**Conventions.**

- Fichiers en `kebab-case`, composants en `PascalCase`.
- Tout fichier qui touche aux données serveur importe `server-only`.
- Un module n'importe pas les fichiers internes d'un autre module. La logique commune remonte dans `lib/`.
- Les composants dépassant environ 200 lignes sont découpés.
- La logique métier (calculs financiers, règles de transition, correspondance des checklists) vit dans des **fonctions pures** testées unitairement.

**Remarque sur l'emplacement actuel.** Le dossier `C:\Users\Lenovo\.gemini\select agency` contient un espace et se trouve dans un répertoire d'outil. Je recommande `C:\dev\select-agency` : sans espace, ce chemin évite des erreurs avec certains scripts, Docker et la CLI Supabase.

---

## 6. Modèle de données Supabase

### 6.1 Conventions

- Clé primaire `id uuid default gen_random_uuid()`.
- `organization_id uuid not null` sur toute table métier, avec un index en première position.
- `created_at`, `updated_at` (trigger) et `created_by` sur toutes les tables ; `version int` sur les entités éditables (verrou optimiste).
- Pas de suppression physique des données métier : archivage, annulation, versions remplacées. La suppression définitive relève uniquement de la procédure de rétention ou d'effacement (journalisée).
- Références lisibles par agence, générées par trigger : `CLI-2026-00042`, `DOS-2026-00117`, `REC-2026-00305`. Le compteur est stocké dans `private.reference_counters` et mis à jour par `insert … on conflict do update … returning`, ce qui est sûr en cas d'accès concurrents et ne laisse **aucun trou** (le compteur est annulé avec la transaction en cas d'échec).
- Extensions : `pgcrypto`, `pg_trgm`, `unaccent`, `citext`, `pg_cron`, `pg_net`.
- Vues créées avec `security_invoker = true` (sinon une vue contourne la RLS).

### 6.2 Schéma relationnel

```
auth.users ──1:1── profiles
                      │
organizations ──┬──<  organization_members  >── profiles
                ├──1:1 organization_settings
                ├──<  organization_invitations
                ├──<  clients ──┬──1:1 client_sensitive_data
                │               ├──<  client_contacts
                │               ├──<  client_consents
                │               ├──<  client_notes
                │               └──<  travel_cases ──┬──<  case_workflow_steps
                │                                    ├──<  case_events
                │                                    ├──<  case_document_requirements ──<  documents (versions)
                │                                    ├──<  appointments ──<  reminders
                │                                    ├──<  tasks
                │                                    ├──<  case_charges ──<  payment_allocations  >── payments ──<  refunds
                │                                    └──<  communication_logs
                ├──<  workflow_templates ──<  workflow_template_steps ──<  workflow_template_transitions
                ├──<  document_types
                ├──<  document_checklists ──<  document_checklist_items
                ├──<  service_catalog · payment_methods · message_templates
                ├──<  expenses
                ├──<  notifications
                └──<  audit_logs

Global (lecture seule) : currencies        Privé : private.reference_counters, private.rate_limits
Public sans connexion (via RPC uniquement) : demo_requests
```

### 6.3 Tables par domaine

#### Agences et identités

```
organizations
  id, name, slug (unique), country_code char(2), default_currency → currencies,
  timezone (IANA), locale default 'fr', email, phone, address, city, logo_path,
  legal_identifiers jsonb  -- [{ "label": "RCCM", "value": "…" }]
  status ('trialing'|'active'|'suspended'|'closed'), plan, trial_ends_at, created_at, updated_at

organization_settings  (1:1, PK = organization_id)
  agents_see_all_cases bool default false,  agents_can_record_payments bool default true,
  document_expiry_warning_days int default 90,  appointment_reminder_offsets int[] (minutes),
  receipt_prefix default 'REC',  receipt_footer text,  client_follow_up_after_days int default 7,
  data_retention_months int null (à définir avec un juriste),  week_starts_on smallint

profiles  (id = auth.users.id, créé par trigger à l'inscription)
  full_name, phone_e164, avatar_path, locale, last_organization_id

organization_members
  organization_id, user_id → profiles, role member_role, status ('active'|'suspended'),
  invited_by, joined_at        UNIQUE (organization_id, user_id)
  Contrainte (trigger) : au moins un propriétaire actif par agence

organization_invitations
  organization_id, email citext, role, token_hash (unique, jeton jamais stocké en clair),
  invited_by, expires_at (7 jours), accepted_at, revoked_at
```

#### Référentiels configurables

```
currencies            code char(3) PK, name_fr, symbol, minor_unit smallint     -- global
payment_methods       organization_id, kind payment_method_kind, label ("Orange Money"),
                      provider_code null, merchant_details text null (non secret), is_active, position
document_types        organization_id, code, label, category, has_expiry bool, is_sensitive bool, is_active
service_catalog       organization_id, name, case_category null, charge_type,
                      default_amount_minor bigint null, currency, description, is_active
message_templates     organization_id, purpose, name, channel, language, subject, body,
                      allowed_variables text[], is_system bool, is_active
```

#### Clients

```
clients
  id, organization_id, reference, client_type, first_name, last_name, email citext,
  phone_e164, whatsapp_e164, residence_country char(2), city, preferred_language,
  source (bouche-à-oreille, Facebook…), registered_at date, assigned_to → membre (conseiller principal),
  search_text (trigger : nom + référence + téléphone, sans accents, minuscules),
  archived_at, created_by, created_at, updated_at, version
  Index : GIN trigram sur search_text ; (organization_id, phone_e164) ; (organization_id, email)

client_sensitive_data  (1:1, accès restreint, jamais chargée dans les listes)
  client_id PK, organization_id, date_of_birth, nationality char(2),
  passport_number_ciphertext, passport_number_last4, passport_issuing_country,
  passport_issue_date, passport_expiry_date, updated_by, updated_at

client_contacts   organization_id, client_id, full_name, relationship (parent, tuteur, conjoint,
                  garant, contact d'urgence), phone_e164, email, is_emergency, is_payer
client_consents   organization_id, client_id, channel, purpose ('transactional'|'marketing'),
                  granted bool, source (formulaire, écrit, oral), recorded_by, recorded_at, revoked_at
client_notes      organization_id, client_id, case_id null, body, author_id, created_at, updated_at, deleted_at
```

#### Workflows et dossiers

```
workflow_templates
  organization_id, name, case_category, destination_countries char(2)[] null (null = toutes),
  description, is_default, is_active, version int

workflow_template_steps
  organization_id, template_id, position, key, label, description, kind step_kind,
  is_optional bool, requires_evidence bool, outcome case_outcome null (étapes de résultat),
  default_due_days int null, default_task_title text null

workflow_template_transitions      -- transitions non linéaires uniquement
  organization_id, template_id, from_step_id, to_step_id, label ("Nouvelle demande")

travel_cases
  id, organization_id, reference, client_id  (FK composite même agence),
  category case_category, title null ("Master informatique — Lyon"),
  destination_country char(2), residence_country char(2),
  workflow_template_id, current_step_id → case_workflow_steps,
  status case_status, outcome case_outcome default 'pending', priority case_priority,
  assigned_to → membre, next_action text, next_action_due_at,
  planned_departure_date, planned_return_date, billing_currency → currencies,
  applicant_tags text[] (mineur, salarié, étudiant, sponsorisé… : pilote la checklist),
  details jsonb + details_schema_version  -- champs propres à la catégorie, validés par Zod
  on_hold_reason, on_hold_until, cancelled_reason, cancelled_by_party ('client'|'agency'),
  closed_at, closed_reason, opened_at, created_by, created_at, updated_at, version, idempotency_key
  Index : (organization_id, status), (organization_id, assigned_to), (organization_id, destination_country),
          (organization_id, next_action_due_at)

case_workflow_steps     -- copie du modèle au moment de la création du dossier, puis progression
  organization_id, case_id, template_step_id null, position, key, label, kind, is_optional,
  requires_evidence, outcome null, allowed_next_keys text[],
  status step_status, confirmation_level null ('expected'|'declared'|'confirmed'),
  evidence_document_id → documents null, external_reference text null, source_note text null,
  started_at, completed_at, completed_by, due_at
  CHECK : confirmation_level = 'confirmed' ⇒ evidence_document_id ou external_reference renseigné

case_events             -- historique métier lisible (frise chronologique et délais par étape)
  organization_id, case_id, event_type, from_value, to_value, reason, actor_id, metadata jsonb, created_at
```

#### Documents

```
document_checklists
  organization_id, name, case_category, destination_countries char(2)[] null,
  applicant_tags text[] null, disclaimer text, is_active

document_checklist_items
  organization_id, checklist_id, document_type_id, is_required bool,
  min_validity_months_after_return int null  -- ex. validité du passeport, configurable par destination
  notes, position

case_document_requirements      -- liste propre au dossier, générée puis modifiable
  organization_id, case_id, document_type_id, label, is_required,
  status requirement_status, current_document_id null, due_at, notes,
  waived_reason (si non applicable), source_checklist_id null

documents                       -- chaque fichier = une version
  id, organization_id, client_id, case_id null, requirement_id null, document_type_id,
  version int, replaces_document_id null, storage_path (unique), original_filename,
  mime_type, size_bytes, sha256, status document_status,
  issued_at date null, expires_at date null,
  reviewed_by, reviewed_at, review_comment, uploaded_by, created_at
  Index : (organization_id, case_id), (organization_id, expires_at) partiel sur les versions courantes
```

#### Rendez-vous, rappels, tâches, notifications

```
appointments
  organization_id, case_id null, client_id null, kind appointment_kind, title,
  starts_at, ends_at null, all_day bool, timezone null, location, assigned_to,
  status appointment_status, external_reference, evidence_document_id, notes, created_by
  CHECK : kind = 'administrative' ET status = 'confirmed' ⇒ justificatif ou référence externe

reminders
  organization_id, target_type ('appointment'|'task'|'document_expiry'|'case_deadline'), target_id,
  remind_at, channel ('in_app'|'email'), recipient_user_id null, recipient_client_id null,
  status ('pending'|'sent'|'failed'|'cancelled'|'skipped_no_consent'|'skipped_not_configured'),
  sent_at, error

tasks
  organization_id, title, description, case_id null, client_id null, assigned_to, created_by,
  due_at, priority, status task_status, completed_at, completed_by,
  source ('manual'|'workflow'|'document_review'|'system'), source_ref
  Index partiel : (organization_id, assigned_to, due_at) WHERE status IN ('todo','in_progress')

notifications   organization_id, user_id, type, title, body, link, read_at, created_at
```

#### Finance

```
case_charges                    -- prestations facturables du dossier
  organization_id, case_id, service_id null, label, charge_type ('agency_fee'|'third_party'),
  amount_minor bigint CHECK > 0, currency (= billing_currency du dossier, vérifié),
  original_amount_minor null, original_currency null, exchange_rate numeric null  -- informatif, saisi à la main
  due_date null, status ('active'|'cancelled'), cancelled_reason, created_by, version

payments                        -- sommes reçues du client ; jamais modifiées, seulement annulées
  organization_id, case_id, client_id, amount_minor CHECK > 0, currency,
  payment_method_id, method_kind (copie), method_label (copie),
  transaction_reference text (ex. identifiant de transaction mobile money), payer_name,
  paid_at, received_by, status ('recorded'|'voided'), voided_at, voided_by, void_reason,
  receipt_number (unique par agence), receipt_snapshot jsonb (agence, client, lignes : réimpression identique),
  idempotency_key  UNIQUE (organization_id, idempotency_key), notes, created_at

payment_allocations             -- répartition d'un paiement entre les prestations
  organization_id, payment_id, charge_id, amount_minor CHECK > 0
  Trigger : Σ affectations ≤ montant du paiement ; même devise

refunds
  organization_id, payment_id, charge_id (obligatoire : impute le remboursement), case_id,
  amount_minor CHECK > 0, currency, payment_method_id, refunded_at, reason, reference, created_by
  Trigger : Σ remboursements ≤ montant affecté à la prestation sur ce paiement

expenses
  organization_id, case_id null, expense_type ('operating'|'client_disbursement'),
  category, label, amount_minor, currency, paid_at, payment_method_id, supplier, reference,
  attachment_document_id null, status ('recorded'|'voided'), void_reason, created_by
```

Aucune table ne stocke de numéro de carte bancaire, de code secret ni de code PIN mobile money. Les validations Zod rejettent les champs libres qui ressemblent à un numéro de carte (contrôle de Luhn).

#### Communication, audit, plateforme

```
communication_logs
  organization_id, client_id, case_id null, channel ('email'|'whatsapp'|'sms'|'phone'|'in_person'|'other'),
  direction ('outbound'|'inbound'|'internal'), status communication_status, template_id null,
  subject, body_snapshot, recipient, provider, provider_message_id, error_message, sent_by, sent_at

audit_logs                      -- insertion par triggers uniquement, aucune modification possible
  id bigint identity, organization_id, actor_id, actor_role, action, entity_type, entity_id,
  changes jsonb (avant/après, champs sensibles masqués), created_at
  Index : (organization_id, created_at desc), (organization_id, entity_type, entity_id)

private.reference_counters      (organization_id, kind, year) PK, value
private.rate_limits             key, window_start, count
demo_requests                   name, agency_name, country, phone, email, message, consent, ip_hash, created_at
```

### 6.4 Énumérations

| Type | Valeurs |
|---|---|
| `member_role` | owner, admin, agent, accountant, viewer |
| `client_type` | individual, student, professional, company, other |
| `case_category` | study_abroad, tourist_visa, business_travel, administrative_support, other_mobility, custom_trip |
| `case_status` | active, on_hold, cancelled, closed |
| `case_outcome` | pending, approved, refused, withdrawn, completed, not_applicable |
| `case_priority` | low, normal, high, urgent |
| `step_kind` | agency_action, client_action, external_event, outcome |
| `step_status` | pending, in_progress, done, skipped, skipped_prior (antérieure à SELECT) |
| `requirement_status` | not_received, received, to_verify, validated, to_correct, expired, waived |
| `document_status` | uploading (technique), received, to_verify, validated, to_correct, replaced, expired |
| `appointment_kind` | consultation, prep_interview, administrative, application_deadline, document_deadline, follow_up, departure, other |
| `appointment_status` | planned, awaiting_confirmation, confirmed, done, cancelled, missed |
| `task_status` | todo, in_progress, done, cancelled |
| `payment_method_kind` | cash, bank_transfer, mobile_money, cheque, card_external, other |
| `communication_status` | draft, prepared_manual, queued, sent, delivered, failed, simulated, logged, received |

### 6.5 Fonctions RPC principales

| Fonction | Mode | Rôle |
|---|---|---|
| `create_organization(name, country, currency, timezone)` | DEFINER | Crée l'agence, le membre propriétaire, les paramètres, puis charge les **modèles de départ** (types de documents, workflows, checklists, modèles de messages, moyens de paiement) |
| `accept_invitation(token)` | DEFINER | Vérifie le jeton haché, l'expiration et l'adresse e-mail, puis crée l'appartenance |
| `update_member_role` / `suspend_member` / `transfer_ownership` | DEFINER | Empêche l'auto-promotion et protège le dernier propriétaire |
| `find_client_duplicates(...)` | DEFINER | Recherche dans toute l'agence, mais ne renvoie que la référence pour les clients que l'utilisateur ne peut pas voir |
| `create_case(...)` | INVOKER | Dossier + copie des étapes + génération des exigences documentaires + tâches initiales, dans une seule transaction |
| `transition_case_step(case_id, to_key, reason, evidence_document_id, external_reference, expected_version)` | DEFINER | Applique les règles de transition (§8.3), écrit `case_events`, crée les tâches par défaut |
| `set_case_status(case_id, status, reason, …)` | DEFINER | Pause, annulation, clôture, réouverture |
| `register_document_upload(...)` / `finalize_document_upload(id)` / `review_document(id, status, comment)` | DEFINER | Cycle de vie des documents (§9.4) |
| `record_payment(..., allocations jsonb, idempotency_key)` | DEFINER | Paiement + affectations + numéro de reçu + copie du reçu, dans une seule transaction |
| `void_payment(id, reason)` / `record_refund(...)` | DEFINER | Rôles autorisés uniquement, motif obligatoire |
| `case_financial_summary` (vue) | INVOKER | Convenu, encaissé, remboursé, solde, non affecté, par dossier |
| `dashboard_summary(from, to, filters)` / `report_*(...)` | INVOKER | Agrégats par devise |
| `global_search(q)` | INVOKER | Clients et dossiers (nom, téléphone, référence), 10 résultats maximum |
| `submit_demo_request(...)` | DEFINER, `anon` | Limitation de débit par empreinte d'adresse IP |

### 6.6 Stockage

- Bucket **`documents`**, privé. Limite de taille au niveau du bucket (10 Mo par défaut). Types autorisés : PDF, JPEG, PNG, WebP, HEIC. **Refusés** : SVG, HTML, fichiers bureautiques avec macros, exécutables.
- Chemin : `{organization_id}/{client_id}/{document_id}/v{version}.{ext}`. Le nom d'origine (qui peut contenir des données personnelles) reste en base, pas dans le chemin.
- Politique de lecture sur `storage.objects` : `bucket_id = 'documents'` **et** `private.can_access_document(id extrait du chemin)`. L'API Storage ne permet donc pas de contourner les règles d'accès.
- Pas de politique de modification ni de suppression pour les utilisateurs. Un remplacement est une nouvelle version. La purge passe par le job de rétention.
- Bucket **`branding`** (logos des agences), privé lui aussi, lu par URL signée.

### 6.7 Tâches planifiées (pg_cron)

| Fréquence | Tâche |
|---|---|
| Toutes les 15 min | Envoi des rappels échus (in-app et e-mail si configuré) |
| Quotidienne | Passage en « expiré » des documents dont la date est dépassée ; alertes d'expiration proche ; contrôle de la validité du passeport par rapport à la date de retour prévue |
| Quotidienne | Notifications de prochaines actions et d'échéances dépassées |
| Quotidienne | Nettoyage des envois inachevés (`uploading` depuis plus de 24 h) et des invitations expirées |
| Mensuelle | Liste des dossiers arrivés au terme de la durée de conservation, **soumise au propriétaire** pour confirmation (purge automatique en V1.1) |

### 6.8 Ordre des migrations

1. `0001_extensions_schemas` — extensions, schéma `private`, droits
2. `0002_enums_reference` — énumérations, `currencies`
3. `0003_tenancy` — organizations, settings, profiles, members, invitations, fonctions d'aide RLS
4. `0004_configuration` — moyens de paiement, types de documents, prestations, modèles de messages
5. `0005_clients`
6. `0006_workflows_cases`
7. `0007_documents_storage` — tables, bucket, politiques Storage
8. `0008_calendar_tasks_notifications`
9. `0009_finance`
10. `0010_communications`
11. `0011_audit_triggers`
12. `0012_views_rpc` — vues, RPC, rapports
13. `0013_cron_jobs`
14. `0014_default_templates` — fonction de chargement des modèles de départ

Une migration appliquée n'est jamais modifiée. Les changements destructifs suivent le schéma _expand / contract_ (ajouter, migrer les données, supprimer plus tard) après une sauvegarde.

---

## 7. Rôles et permissions

### 7.1 Rôles

| Rôle | Profil |
|---|---|
| **Propriétaire** | Dirigeant. Tous les droits, abonnement, transfert de propriété, fermeture de l'agence. Au moins un par agence. |
| **Administrateur** | Bras droit. Tous les droits opérationnels, gestion de l'équipe (sans toucher au propriétaire), paramètres. |
| **Agent** | Conseiller. Clients, dossiers, documents, rendez-vous, tâches, communications. Par défaut, il ne voit que **ses** dossiers (paramétrable). |
| **Comptable** | Finance complète ; lecture des clients et dossiers sans les données d'identité ni les documents. |
| **Lecture seule** | Consultation opérationnelle, sans finance, sans documents, sans données sensibles. |

### 7.2 Matrice des permissions

✅ autorisé · ◐ autorisé sous condition · — interdit

| Capacité | Propriétaire | Admin | Agent | Comptable | Lecture seule |
|---|:-:|:-:|:-:|:-:|:-:|
| Tableau de bord | ✅ | ✅ | ◐ ses dossiers, sans finance globale | ◐ vue financière | ◐ sans finance |
| Voir les clients | ✅ | ✅ | ◐ selon visibilité¹ | ◐ champs non sensibles | ◐ champs non sensibles |
| Créer / modifier un client | ✅ | ✅ | ✅ | — | — |
| Archiver un client | ✅ | ✅ | — | — | — |
| Données d'identité (passeport) | ✅ | ✅ | ◐ dossiers accessibles | — | — |
| Créer un dossier, changer d'étape | ✅ | ✅ | ◐ dossiers accessibles | — | — |
| Attribuer / réattribuer un dossier | ✅ | ✅ | — | — | — |
| Pause, annulation, réouverture | ✅ | ✅ | ◐ pause uniquement | — | — |
| Téléverser, vérifier un document | ✅ | ✅ | ◐ dossiers accessibles | — | — |
| Télécharger un document | ✅ | ✅ | ◐ dossiers accessibles | — | — |
| Rendez-vous, tâches | ✅ | ✅ | ✅ | ◐ ses tâches | — |
| Enregistrer un paiement | ✅ | ✅ | ◐ si le paramètre est activé² | ✅ | — |
| Annuler un paiement, rembourser | ✅ | ✅ | — | ✅ | — |
| Dépenses | ✅ | ✅ | — | ✅ | — |
| Rapports financiers, exports | ✅ | ✅ | — | ✅ | — |
| Rapports opérationnels | ✅ | ✅ | ◐ ses données | — | ✅ |
| Envoyer une communication | ✅ | ✅ | ✅ | ◐ reçus uniquement | — |
| Inviter, changer les rôles | ✅ | ◐ sauf propriétaire | — | — | — |
| Paramètres, workflows, checklists, modèles | ✅ | ✅ | — | ◐ paramètres financiers | — |
| Journal d'audit | ✅ | ✅ | — | — | — |
| Abonnement, transfert, fermeture de l'agence | ✅ | — | — | — | — |

¹ Paramètre `agents_see_all_cases` (désactivé par défaut, au nom du moindre privilège) : sinon l'agent voit les dossiers qui lui sont attribués ou qu'il a créés, et les clients liés.
² Paramètre `agents_can_record_payments` (activé par défaut : dans beaucoup d'agences, c'est le conseiller qui reçoit l'argent). L'annulation reste réservée aux rôles financiers.

### 7.3 Application à trois niveaux

1. **Interface** : `<Can permission="payment.void">` masque les actions non autorisées. C'est un confort d'usage, pas une sécurité.
2. **Serveur** : chaque page et chaque Server Action appelle `requirePermission()`. Une Server Action est un point d'accès HTTP public ; elle ne fait jamais confiance au client.
3. **Base de données** : la RLS et les contrôles internes des RPC forment la barrière finale.

Les niveaux 2 et 3 partagent la même matrice. Un test parcourt chaque couple (rôle, permission) dans les deux couches et échoue au moindre écart.

```ts
// src/lib/auth/permissions.ts (extrait)
export const PERMISSIONS = {
  'client.read':           ['owner', 'admin', 'agent', 'accountant', 'viewer'],
  'client.write':          ['owner', 'admin', 'agent'],
  'client.archive':        ['owner', 'admin'],
  'client.sensitive.read': ['owner', 'admin', 'agent'],
  'case.assign':           ['owner', 'admin'],
  'payment.create':        ['owner', 'admin', 'accountant', 'agent'], // agent : selon le paramètre
  'payment.void':          ['owner', 'admin', 'accountant'],
  'team.manage':           ['owner', 'admin'],
  'billing.manage':        ['owner'],
} as const satisfies Record<string, readonly MemberRole[]>;
```

```sql
-- Fonction d'aide (extrait) : accès à un dossier
create function private.can_access_case(org uuid, assignee uuid, creator uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organization_settings s on s.organization_id = m.organization_id
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role in ('owner', 'admin', 'accountant', 'viewer')
        or (m.role = 'agent' and (s.agents_see_all_cases
                                  or assignee = (select auth.uid())
                                  or creator  = (select auth.uid())))
      )
  );
$$;

create policy travel_cases_select on public.travel_cases
  for select to authenticated
  using (private.can_access_case(organization_id, assigned_to, created_by));
```

### 7.4 Synthèse des politiques RLS

| Table | Lecture | Création | Modification | Suppression |
|---|---|---|---|---|
| organizations | membres | RPC `create_organization` | propriétaire, admin | aucune |
| organization_members | membres de l'agence | RPC (invitation) | RPC (rôles) | RPC (dernier propriétaire protégé) |
| clients | `can_access_client` | propriétaire, admin, agent | idem, avec accès | aucune (archivage) |
| client_sensitive_data | propriétaire, admin, agent avec accès | idem | idem | aucune |
| travel_cases | `can_access_case` | propriétaire, admin, agent | champs simples ; étapes et statut par RPC | aucune |
| documents | accès au dossier, sauf comptable et lecture seule | RPC | RPC (vérification) | aucune (purge planifiée) |
| payments, allocations, refunds | rôles financiers + agent sur ses dossiers | RPC | aucune (annulation par RPC) | aucune |
| expenses | propriétaire, admin, comptable | idem | idem | aucune |
| audit_logs | propriétaire, admin | triggers uniquement | aucune | aucune |
| currencies | tout utilisateur connecté | — | — | — |

Un test pgTAP échoue si une table du schéma `public` n'a pas la RLS activée.

---

## 8. Workflows métier des dossiers

### 8.1 Trois dimensions indépendantes

| Dimension | Question | Valeurs |
|---|---|---|
| **Étape** | Où en est le dossier ? | Étapes du workflow copiées dans le dossier |
| **Statut** | Le dossier est-il vivant ? | Actif · En pause · Annulé · Clôturé |
| **Niveau de confirmation** (étapes externes et étapes de résultat) | Le fait est-il prouvé ? | Prévu · **Déclaré** (information reçue, non vérifiée) · **Confirmé** (justificatif joint ou référence officielle saisie) |

Chaque étape a un type, affiché par une icône et un libellé :

- **Action agence** : l'agence maîtrise l'étape (préparation, vérification).
- **Action client** : on attend le client (pièces, paiement).
- **Événement externe** : cela dépend d'un tiers (établissement, consulat, centre de dépôt, administration).
- **Résultat** : issue (visa accordé ou refusé, admission obtenue ou non).

Le tableau de bord distingue ainsi « en attente du client », « en attente d'un tiers » et « à traiter par l'agence ».

### 8.2 Modèles de départ

Les modèles de départ sont fournis à la création de l'agence. Ce sont des **exemples modifiables, signalés comme indicatifs** : « Les démarches réelles dépendent de la destination, du pays de résidence et de la situation du demandeur. Vérifiez auprès des sources officielles. »

**Études à l'étranger**

| # | Étape | Type | Remarque |
|---|---|---|---|
| 1 | Nouveau candidat | Agence | Création du dossier |
| 2 | Inscription auprès de l'agence | Agence | Prestations convenues, acompte éventuel |
| 3 | Vérification initiale | Agence | Profil, projet, faisabilité |
| 4 | Collecte des documents | Client | Alerte si la checklist obligatoire est incomplète |
| 5 | Préparation de la candidature | Agence | |
| 6 | Procédure liée aux études, si applicable | Externe | **Facultative**, selon le pays de résidence et la destination |
| 7 | Préparation de l'entretien | Agence | Facultative |
| 8 | Attente de la réponse de l'établissement | Externe | Confirmation par la lettre d'admission ou de refus |
| 9 | Préparation du dossier de visa | Agence | |
| 10 | Rendez-vous et dépôt du dossier | Externe | Confirmation par la preuve de rendez-vous ou le récépissé de dépôt |
| 11 | Attente de la décision | Externe | |
| 12 | Visa accordé | Résultat | Issue « accordé » |
| 13 | Visa refusé | Résultat | Issue « refusé » |
| 14 | Préparation du départ | Agence | Seulement après l'étape 12 |
| 15 | Dossier clôturé | Fin | Contrôle du solde |

Transitions non linéaires :

- 11 → 12 ou 13 ;
- 13 → 15, ou 13 → 9 (« nouvelle demande ») ;
- 8 sans admission → 5 (« autre établissement ») ou 15.

**Visa touristique (destination avec rendez-vous)** : Demande reçue → Évaluation du profil et de la destination → Devis et acompte → Collecte des documents (client) → Vérification interne → Justificatifs de voyage réels (hébergement, transport, assurance) → Prise de rendez-vous (externe) → Dépôt et biométrie (externe) → Attente de la décision (externe) → Visa accordé / refusé (résultat) → Remise du passeport → Clôture.

**Variante e-Visa** : Demande en ligne (agence) → Paiement des frais officiels (externe) → Attente (externe) → e-Visa reçu / refusé (résultat, confirmé par le document) → Clôture.

**Voyage d'affaires** : Demande → Invitation ou ordre de mission (client) → Visa si nécessaire (sous-étapes de la variante adaptée) → Réservations (externe, confirmées par le prestataire) → Départ → Clôture.

**Accompagnement administratif** : Demande → Analyse → Collecte → Constitution du dossier → Dépôt auprès de l'administration (externe) → Suivi → Résultat (externe) → Clôture.

**Voyage ou séjour personnalisé** : Demande → Proposition et devis → Accord et acompte (client) → Réservations (externe) → Solde → Remise des documents de voyage → Voyage → Retour et avis → Clôture.

**Autre mobilité** : modèle court et générique (Demande → Analyse → Constitution → Démarche externe → Résultat → Clôture) que l'agence adapte.

Le système **ne génère jamais** de faux justificatifs (réservations fictives, attestations) et n'aide pas à en produire.

### 8.3 Règles de transition

1. **Avancer** vers l'étape suivante ou une transition déclarée : autorisé.
   - Étape agence ou client : terminée librement.
   - Étape externe ou de résultat : on choisit « Déclaré » (la **source** est obligatoire, par exemple « appel du client le 12/11 ») ou « Confirmé » (justificatif ou référence **obligatoire**, contrainte en base).
2. **Revenir** à une étape antérieure : autorisé, **motif obligatoire**, journalisé.
3. **Passer** une étape facultative : autorisé, motif obligatoire.
4. **Sauter** une étape obligatoire : interdit, sauf **forçage par un administrateur** avec motif (journalisé, signalé dans l'historique).
5. **Dossier existant repris en cours de route** : à la création, on choisit l'étape de départ. Les étapes précédentes sont marquées « antérieures à SELECT » ; on ne prétend pas qu'elles ont été faites dans le système.
6. **Pause** : motif obligatoire, date de reprise facultative (un rappel est créé).
7. **Annulation** (propriétaire, admin) : motif et partie à l'origine (client ou agence) obligatoires. L'interface propose de traiter un éventuel remboursement.
8. **Clôture** : une étape de fin est requise, ou un motif explicite. Si le solde n'est pas nul, un avertissement demande une confirmation. Un dossier clôturé passe en lecture seule, sauf la finance et les notes. La réouverture est réservée au propriétaire ou à l'admin, avec motif.
9. **Modification d'un modèle** : elle n'affecte que les nouveaux dossiers. Les dossiers en cours gardent leur copie. Un modèle utilisé ne peut pas être supprimé, seulement désactivé.
10. Chaque transition écrit dans `case_events` et `audit_logs`, et met à jour la « prochaine action » proposée.

L'interface d'un dossier n'affiche **jamais** « Visa garanti » ni une issue confirmée sans justificatif. Une issue déclarée s'affiche « Visa accordé — déclaré, non vérifié ».

### 8.4 Checklists documentaires

À la création d'un dossier, le système sélectionne les checklists actives dont :

- la **catégorie** correspond à celle du dossier ;
- la **destination** correspond (ou n'est pas restreinte) ;
- les **profils** du demandeur recoupent ceux du dossier (mineur, salarié, étudiant, indépendant, sponsorisé…).

Les éléments sont fusionnés sans doublon : en cas de conflit, « obligatoire » l'emporte. La liste est **copiée dans le dossier**. Le conseiller la relit et peut ajouter une pièce, en retirer une, ou la déclarer non applicable avec un motif. Aucune checklist universelle n'est imposée.

### 8.5 Automatisations au lancement (règles système, non configurables)

| Déclencheur | Effet |
|---|---|
| Arrivée sur une étape qui a une tâche par défaut | Tâche créée pour le conseiller, avec échéance |
| Document marqué « à corriger » | Tâche « Demander une nouvelle version » + message préparé pour le client |
| Nouveau document reçu | Exigence passée en « reçu » + notification au conseiller |
| Rendez-vous créé | Rappels planifiés selon les délais de l'agence |
| Document qui expire bientôt, ou passeport insuffisamment valide après le retour prévu | Notification + badge sur le dossier |
| Prochaine action échue | Le dossier apparaît dans « À traiter » |
| Paiement enregistré | Reçu généré ; envoi par e-mail proposé si le client a une adresse, si le fournisseur est configuré et si le consentement est enregistré |

---

## 9. Règles métier par module

### 9.1 Tableau de bord

| Indicateur | Définition |
|---|---|
| Clients | Clients non archivés |
| Dossiers actifs | `status = active` |
| En attente | Dossiers actifs dont l'étape courante est **externe** (« en attente d'un tiers ») ou **client** (« en attente du client ») : deux compteurs distincts |
| Incomplets | Dossiers actifs avec au moins une pièce obligatoire non reçue ou à corriger |
| Terminés | Dossiers clôturés sur la période |
| Rendez-vous à venir | 7 prochains jours |
| Tâches en retard | Échéance dépassée, ni terminées ni annulées |
| Documents manquants | Nombre de pièces obligatoires non reçues sur les dossiers actifs |
| Encaissé / Reste à recevoir / Dépenses / Revenus et marge estimés | Par devise (§9.5), libellés « estimés — base encaissements, non comptable » |
| Activité récente | Les 20 derniers `case_events`, présentés en langage clair |

- **Filtres** : période, catégorie, destination, statut, conseiller.
- **Graphiques** : dossiers ouverts et clôturés par mois, encaissements par mois, dossiers par destination et par catégorie.
- **État vide** pour une agence neuve, sous forme de liste de démarrage : compléter le profil de l'agence, vérifier les workflows, inviter l'équipe, créer le premier client. **Aucun chiffre fictif.**

### 9.2 Clients

- **Création courte** : nom, prénom, téléphone, pays de résidence. Le reste peut être complété plus tard.
- **Doublons** : au moment de la saisie, le système compare le téléphone E.164, l'adresse e-mail normalisée et le nom sans accents (similarité trigramme), avec la date de naissance en appui. Il affiche « Client similaire : CLI-2026-00042 » avec un lien. L'utilisateur choisit « Ouvrir le client existant » ou « Créer quand même ». **Aucune fusion automatique.**
- **Listes** : jamais de données d'identité. Le passeport est affiché masqué (`••••1234`) et n'est révélé que sur action explicite (journalisée).
- **Archivage** : le client disparaît des listes et reste consultable par filtre. Impossible s'il a un dossier actif.

### 9.3 Dossiers

- **Création en 3 étapes** : client → catégorie, destination et profils → conseiller, priorité, date de départ envisagée. La checklist générée et le workflow s'affichent ensuite pour relecture.
- **Onglets du détail** : Aperçu · Étapes · Documents · Rendez-vous · Finance · Tâches · Communications · Notes · Historique.
- **Champs propres à la catégorie** (par exemple pour les études : niveau visé, filière, rentrée visée, établissements ciblés) : stockés dans `details`, avec un schéma Zod versionné par catégorie.

### 9.4 Documents

**Cycle d'envoi**, conçu pour les réseaux instables et la limite de 4,5 Mo des fonctions Vercel :

1. Le navigateur compresse les photos.
2. `prepareUpload` (Server Action) vérifie la permission, le type et la taille, crée la ligne `uploading` et renvoie une **URL signée d'envoi**.
3. Le navigateur envoie le fichier **directement à Supabase Storage**, avec une barre de progression.
4. `finalizeUpload` vérifie que l'objet existe, sa taille, et la **signature binaire** des premiers octets (un PDF commence par `%PDF`, un JPEG par `FF D8 FF`, etc.). Il calcule l'empreinte SHA-256 et passe le document en « reçu ». S'il remplace une version, la précédente passe en « remplacé ».

**Téléchargement** : `/api/documents/[id]/download` vérifie l'accès, écrit l'audit `document.downloaded`, puis redirige vers une URL signée de **60 secondes** avec `Content-Disposition: attachment`.

**Statuts** :

| Statut | Signification |
|---|---|
| Non reçu | Exigence sans fichier |
| Reçu | Fichier stocké, pas encore examiné |
| À vérifier | Examen demandé ou en cours |
| Vérifié par l'agence | Contrôle interne, accompagné de l'infobulle « Ne constitue pas une validation par une ambassade, un consulat ou une administration » |
| À corriger | Commentaire obligatoire, nouvelle version demandée |
| Remplacé | Version antérieure |
| Expiré | Date d'expiration dépassée (si applicable) |

### 9.5 Finance

**Règles.**

- **Une devise de facturation par dossier** (devise de l'agence par défaut). Un montant d'origine en devise étrangère, par exemple des frais officiels en EUR, est noté **à titre informatif** avec le taux saisi à la main. Il n'y a jamais de conversion automatique.
- Les prestations sont de deux types :
  - **frais de l'agence** : son revenu ;
  - **montants tiers** : frais officiels, frais de scolarité, billets, assurances. Ces sommes sont reçues pour le compte de tiers et **ne sont pas des revenus**.
- Chaque paiement est **affecté** à une ou plusieurs prestations. Le formulaire propose une répartition modifiable.
- Un paiement n'est jamais modifié ni supprimé. On l'**annule**, avec un motif (propriétaire, admin ou comptable), et le reçu affiche « ANNULÉ ».
- Chaque remboursement est imputé à une prestation et plafonné à ce qui a été affecté.
- Numéros de reçu séquentiels par agence et par année, sans trou. Le reçu est une copie figée : une réimpression donne exactement le même document.
- Les montants sont saisis dans un champ spécialisé qui connaît le nombre de décimales de la devise (« 150 000 FCFA »).

**Formules** (implémentées une seule fois en SQL dans les vues, et reproduites en TypeScript pour l'affichage instantané des formulaires, avec un test croisé entre les deux) :

```
Pour un dossier, dans sa devise de facturation :
  Convenu          = Σ prestations actives (frais agence + montants tiers)
  Encaissé brut    = Σ paiements non annulés
  Remboursé        = Σ remboursements
  Encaissé net     = Encaissé brut − Remboursé
  Solde dû         = Convenu − Encaissé net          (si négatif : « trop-perçu »)
  Non affecté      = Encaissé brut − Σ affectations  (alerte s'il est supérieur à 0)

Pour l'agence, sur une période, PAR DEVISE (jamais additionnées entre elles) :
  Revenus agence (estimés)  = Σ affectations sur frais agence − remboursements correspondants
  Fonds tiers reçus         = Σ affectations sur montants tiers − remboursements correspondants
  Fonds tiers reversés      = Σ dépenses de type « reversement pour le compte du client »
  Fonds tiers détenus       = Fonds tiers reçus − Fonds tiers reversés
  Dépenses de l'agence      = Σ dépenses de type « fonctionnement »
  Marge estimée             = Revenus agence − Dépenses de l'agence
```

**Robustesse.**

- Clé d'idempotence générée à l'ouverture du formulaire : un double clic ou un nouvel essai après une coupure ne crée pas de doublon.
- Bouton désactivé pendant l'envoi.
- Verrou sur le compteur de reçus.

### 9.6 Communication

- **Modèles** avec variables autorisées (`{{client.prenom}}`, `{{dossier.reference}}`, `{{documents_manquants}}`…). Les valeurs sont **échappées**, il n'y a jamais de HTML brut. Un aperçu est affiché avant l'envoi.
- **E-mail** : envoyé uniquement si le fournisseur est configuré. Le statut passe à « envoyé » quand le fournisseur accepte le message, et à « délivré » seulement si un webhook le confirme.
- **WhatsApp (lancement)** : lien `https://wa.me/<numéro>?text=<message>`. Il ouvre WhatsApp avec le message prérempli, et **c'est l'agent qui envoie**. Le journal indique « Préparé — envoi manuel ». C'est une fonction réelle, pas une simulation.
- **Journalisation manuelle** : appel, visite, message reçu, pour garder un historique complet.
- **Consentement** : les messages liés au dossier (transactionnels) et les messages commerciaux (consentement explicite requis) sont distingués, avec un désabonnement possible. Sans consentement enregistré, un rappel automatique est **ignoré et journalisé comme tel**.
- **Développement** : le fournisseur `console` marque les messages « Simulé (développement) » avec un badge visible.

### 9.7 Tâches et équipe

- Vues « Mes tâches », « Toutes » (admin), « En retard », « Aujourd'hui ». Une tâche peut être liée à un dossier ou à un client.
- Page Équipe : membres, rôle, statut, invitations en cours, charge (dossiers actifs, tâches ouvertes, tâches en retard).
- Un membre suspendu perd l'accès immédiatement : la RLS vérifie `status = active` à chaque requête.

### 9.8 Rapports

- Dossiers créés et terminés, répartition par destination et par catégorie, dossiers en attente (agence, client, tiers), paiements reçus, soldes à recevoir, revenus et dépenses par devise, délai moyen **des étapes maîtrisées par l'agence**, volume de travail par membre.
- **Performance d'un agent** : on mesure ce qu'il maîtrise (dossiers suivis, tâches réalisées dans les délais, délai de traitement des étapes internes). **Le taux de visas accordés n'est jamais présenté comme sa performance.** Les issues par destination sont affichées à titre informatif, avec la mention « Les décisions relèvent des autorités compétentes ».
- **Export CSV** : UTF-8 avec BOM et séparateur `;` (ouverture correcte dans Excel en français). Les cellules commençant par `=`, `+`, `-` ou `@` sont neutralisées (injection de formules). Chaque export est journalisé.

---

## 10. Routes et pages

| Route | Accès | Contenu |
|---|---|---|
| `/` | Public | Landing |
| `/pricing` | Public | Formules |
| `/privacy`, `/terms` | Public | Pages légales (à faire valider par un juriste) |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Public | Authentification |
| `/auth/confirm` | Public (route handler) | Vérification des liens e-mail |
| `/invite/[token]` | Public, puis connecté | Acceptation d'invitation |
| `/onboarding` | Connecté sans agence | Création de l'agence |
| `/dashboard` | Membre | Tableau de bord |
| `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/edit` | Selon matrice | Clients (onglets via `?tab=`) |
| `/cases`, `/cases/new`, `/cases/[id]`, `/cases/[id]/edit` | Selon matrice | Dossiers |
| `/documents` | Propriétaire, admin, agent | Vue transverse : à vérifier, manquants, expirant bientôt |
| `/appointments` | Membre | Calendrier (`?view=month\|list`, liste par défaut sur mobile) |
| `/tasks` | Membre | Tâches |
| `/finance`, `/finance/payments`, `/finance/expenses`, `/finance/receipts/[id]` | Rôles financiers (+ agent : ses paiements) | Finance |
| `/reports` | Selon matrice | Rapports |
| `/team` | Propriétaire, admin | Équipe et invitations |
| `/account` | Connecté | Profil, mot de passe, sessions |
| `/settings` | Propriétaire, admin | Agence : identité, identifiants légaux, devise, fuseau, logo |
| `/settings/workflows`, `/settings/workflows/[id]` | Propriétaire, admin | Éditeur de workflows |
| `/settings/documents` | Propriétaire, admin | Types de documents et checklists |
| `/settings/services` | Propriétaire, admin | Catalogue de prestations |
| `/settings/finance` | Propriétaire, admin, comptable | Moyens de paiement, reçus |
| `/settings/messages` | Propriétaire, admin | Modèles de messages |
| `/settings/notifications` | Propriétaire, admin | Délais de rappel, alertes |
| `/settings/data` | Propriétaire | Rétention, exports, fermeture |
| `/settings/billing` | Propriétaire | Abonnement SELECT |
| `/api/documents/[id]/download` | Selon matrice | Téléchargement journalisé |
| `/api/receipts/[id]/pdf` | Rôles financiers + agent concerné | PDF du reçu |
| `/api/exports/[report]` | Selon matrice | CSV |

Chaque page privée appelle une garde serveur : session, agence active, permission. Un identifiant inconnu ou inaccessible renvoie vers `not-found`.

---

## 11. Identité visuelle et composants UI

### 11.1 Analyse du logo fourni

- **Couleurs observées** : fond **bleu marine profond** (environ `#023764`) et **jaune vif, citron ou fluo** (environ `#F0FF0A`). Ce jaune est plus vert et plus lumineux qu'un « jaune doré ». Je prends le logo comme référence. **Valeurs exactes à confirmer avec le fichier source.**
- **Contrastes estimés** :
  - jaune sur bleu : environ 11:1 (excellent) ;
  - bleu sur blanc : environ 12:1 (excellent) ;
  - **jaune sur blanc : environ 1,1:1 (illisible)**.
- **Typographie** : mot-symbole « SELECT » dessiné sur mesure (formes géométriques, terminaisons arrondies, lettres E-L-E imbriquées), « Agency » dans un style arrondi technique, souligné d'une barre. Le logo est utilisé **en fichier vectoriel (SVG)**, jamais recomposé avec une police.

### 11.2 Règles de charte proposées

À affiner en Phase 2 avec vos captures d'écran.

- **Bleu marine** : couleur primaire (sidebar, boutons principaux, titres).
- **Jaune** : accent, uniquement **sur fond bleu** ou en aplat avec du texte bleu (indicateur de menu actif, mise en avant, bouton d'appel à l'action de la landing). **Jamais de texte jaune sur fond clair.**
- **Neutres** légèrement teintés de bleu pour les fonds, bordures et textes secondaires.
- **Couleurs d'état** distinctes du jaune de marque :
  - avertissement en **orange ambré**, pour ne pas être confondu avec l'accent ;
  - succès en vert ;
  - erreur en rouge ;
  - information en bleu clair.
  - Toujours accompagnées d'une **icône et d'un libellé** : jamais la couleur seule.
- **Police d'interface** : sans-serif très lisible avec les accents (proposition : Inter). Le style des titres sera décidé en Phase 2.
- **Accessibilité** :
  - contrastes WCAG 2.1 AA ;
  - zones tactiles de 44 px minimum ;
  - champs en 16 px minimum (évite le zoom automatique sur mobile) ;
  - focus visible ;
  - navigation au clavier.
- **Icône d'application et favicon** : monogramme « S » dérivé du logo, à valider.
- **Mode sombre** : hors MVP. Les variables de couleur le rendront possible plus tard.

### 11.3 Composants principaux

| Famille | Composants |
|---|---|
| Structure | `AppShell`, `Sidebar` repliable (tiroir sur mobile), `Topbar` (recherche globale ⌘K, notifications, menu utilisateur, sélecteur d'agence si multi-agences), `PageHeader` (titre, fil d'Ariane, actions), `MobileNav` |
| Données | `DataTable` (tri, filtres et pagination serveur, colonnes masquables, **cartes sur mobile**), `FilterBar`, `SearchInput` (avec délai, synchronisé avec l'URL), `Pagination`, `StatCard`, graphiques chargés à la demande |
| États | `EmptyState` (avec action), squelettes de chargement, `ErrorState` (message utile + identifiant d'erreur), `OfflineBanner`, `DraftRestoredBanner`, `DemoDataBanner` (Phases 3-4), notifications de réussite et d'échec (sonner) |
| Statuts | `StatusBadge` **unique**, piloté par une table de correspondance (statut → couleur, icône, libellé) pour tous les modules ; `ConfirmationBadge` (Prévu, Déclaré, Confirmé + trombone vers la preuve) ; `PriorityBadge` |
| Formulaires | Primitives shadcn + React Hook Form ; `MoneyInput` (selon la devise), `PhoneInput` (pays par défaut, E.164), `CountrySelect` (noms en français via `Intl.DisplayNames`), `DatePicker` (en français), `Combobox` (recherche de client), `FileUploader` (glisser-déposer, **appareil photo sur mobile**, compression, progression) |
| Métier | `WorkflowStepper` (vertical sur mobile, horizontal sur ordinateur), `StepTransitionDialog` (justificatif ou source obligatoires selon le type), `DocumentChecklist`, `CaseHeader`, `FinancialSummary` (frais agence et montants tiers séparés), `PaymentForm` (avec répartition), `ReceiptPreview`, `Timeline`, `CalendarMonth` et `AgendaList`, `TaskList`, `MessageComposer` (modèle, aperçu, e-mail ou WhatsApp) |
| Sécurité d'usage | `ConfirmDialog` (opérations destructives ; saisie de confirmation pour les plus graves), `Can` (masquage selon les permissions, en complément du serveur) |

---

## 12. Sécurité

### 12.1 Mesures

**Isolation**

- RLS sur 100 % des tables exposées.
- Clés étrangères composites limitées à une même agence.
- Fonctions d'aide en `SECURITY DEFINER` avec `search_path = ''`.
- Vues en `security_invoker`.
- Test automatique : aucune table sans RLS.

**Authentification**

- Confirmation de l'adresse e-mail obligatoire.
- Mot de passe de 10 caractères minimum, et protection contre les mots de passe divulgués si la formule le permet.
- Limites de débit de Supabase Auth, liste stricte des URLs de redirection.
- Vérification côté serveur par `getUser()` ou `getClaims()`, jamais par la seule session lue dans le cookie.
- MFA pour les propriétaires et administrateurs en V1.1.

**Autorisation**

- Garde serveur sur chaque page et chaque Server Action (authentification, appartenance, permission, puis validation Zod).
- **Le proxy (middleware) n'est jamais la seule protection** : une faille de 2025 (CVE-2025-29927) a permis de le contourner. Next.js est maintenu à jour.

**Server Actions**

- Ce sont des points d'accès publics : chacune est validée.
- Next.js vérifie l'origine (protection CSRF).
- Limitation de débit sur les actions sensibles (invitations, exports, demandes de démonstration).

**Documents**

- Bucket privé, liste blanche de types, vérification de la signature binaire.
- URLs signées de 60 secondes, téléchargement forcé en pièce jointe.
- Accès journalisé ; aucun document mis en cache sur l'appareil.

**Données sensibles**

- Table séparée pour l'identité ; numéro de passeport chiffré.
- Aucune donnée sensible dans les listes, journaux, URLs, brouillons locaux ou outils de suivi d'erreurs.

**Secrets**

- Variables d'environnement côté serveur, `server-only`, validation de l'environnement au démarrage.
- `gitleaks` dans la CI ; `.env*` ignorés par Git.
- Seules l'URL et la clé publique Supabase sont `NEXT_PUBLIC_`.

**En-têtes HTTP**

- CSP, HSTS, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (appareil photo autorisé uniquement pour l'envoi de documents).

**Injection**

- Requêtes paramétrées (client Supabase, RPC).
- Variables de modèles échappées.
- Cellules CSV neutralisées.

**Erreurs**

- Messages génériques côté utilisateur et identifiant de corrélation.
- Détail côté serveur, avec Sentry configuré pour masquer les données personnelles.

**Finance interne**

- Paiements non modifiables, annulation réservée et motivée.
- Audit complet ; caisse journalière par agent en V1.1.

**Exploitation**

- Sauvegardes quotidiennes (Supabase Pro), restauration testée avant l'ouverture, option de restauration à un instant donné.
- Advisors Supabase (sécurité et performance) sans alerte critique.

**Conformité**

- Politique de confidentialité, contrat de sous-traitance agence ↔ SELECT, registre des traitements.
- Durées de conservation configurables, procédure d'effacement.
- Les autorités nationales (par exemple la CDP au Sénégal, l'ARTCI en Côte d'Ivoire, l'APDP au Bénin) imposent des obligations de déclaration, d'information, de sécurité et d'encadrement des transferts à l'étranger : **validation juridique requise avant le lancement commercial**.

### 12.2 Menaces prioritaires

| Menace | Parade | Vérification |
|---|---|---|
| Une agence voit les données d'une autre | RLS, clés composites, pas de clé secrète dans les parcours | pgTAP sur chaque table + E2E à deux agences |
| Accès direct par URL (`/cases/<id d'une autre agence>`) | RLS → 404 | E2E |
| Agent qui s'attribue le rôle d'admin | Rôles modifiables uniquement par RPC avec contrôle ; pas de politique UPDATE directe | pgTAP |
| Téléchargement d'un passeport sans droit | Politique Storage + route journalisée + URL de 60 s | Intégration + E2E |
| Fichier piégé (SVG/HTML, faux PDF) | Liste blanche, signature binaire, pièce jointe forcée ; antivirus en V1.1 | Tests d'intégration |
| Double paiement (double clic, réseau) | Clé d'idempotence unique | Test de concurrence |
| Numéros de reçu en double | Compteur verrouillé dans la transaction | Test de concurrence (N paiements simultanés) |
| Suppression du dernier propriétaire | Trigger + RPC | pgTAP |
| Fuite de la clé secrète | `server-only`, gitleaks, revue | CI |
| Fraude interne (encaissement puis annulation) | Annulation réservée, motif, audit, rapport des annulations | pgTAP + rapport |

---

## 13. Stratégie de tests

| Niveau | Outil | Contenu |
|---|---|---|
| **Unitaires** | Vitest | Monnaie (format XAF à 0 décimale, NGN à 2, saisie, répartition, soldes, remboursements plafonnés) ; règles de transition (justificatif, étapes facultatives, retours avec motif, forçage) ; correspondance des checklists ; matrice des permissions ; schémas Zod ; téléphones par pays ; normalisation des doublons ; rendu et échappement des modèles ; échappement CSV ; références ; fuseaux (dont Africa/Lubumbashi) |
| **Base de données** | pgTAP (`supabase test db`) | RLS active partout ; pour **chaque** table, lecture, écriture et suppression impossibles depuis une autre agence ; restrictions par rôle ; paramètre de visibilité des agents ; dernier propriétaire ; auto-promotion ; triggers d'audit et immuabilité du journal ; contraintes de justificatif ; politiques Storage ; RPC financières |
| **Intégration** | Vitest + Supabase local | `create_organization` charge les modèles ; invitation (valide, expirée, mauvaise adresse) ; `create_case` copie le workflow et génère les exigences ; `record_payment` idempotent ; **paiements concurrents → numéros uniques et sans trou** ; conflit de verrou optimiste ; refus de type MIME falsifié ; URL signée refusée à un non-autorisé ; fournisseur e-mail non configuré → état explicite |
| **Bout en bout** | Playwright (Chromium, ordinateur + mobile 360×740) | Parcours complet (§14, Phase 9) ; isolation entre deux agences ; rôles ; double clic sur « Enregistrer le paiement » ; brouillon restauré après coupure simulée ; e-mails lus dans la boîte de test locale de Supabase (Mailpit ou Inbucket selon la version de la CLI) ; accessibilité (axe) sur les pages clés |
| **Performance** | Lighthouse CI | Budgets du §4.6 sur la landing, le tableau de bord et la liste des dossiers |

**Intégration continue (GitHub Actions)** : installation (cache pnpm) → lint → vérification des types → tests unitaires → `supabase start` → `db reset` → pgTAP → intégration → build → Playwright → rapports. **Une branche ne peut être fusionnée que si tout est vert.**

**Règle de couverture** : au moins 90 % sur `lib/money`, `features/workflows` (règles) et `features/finance` (calculs). Ailleurs, on vise les scénarios critiques plutôt qu'un pourcentage.

---

## 14. Phases d'implémentation et critères de validation

J'ai conservé votre découpage en 10 phases, avec trois ajustements :

- une **Phase 0** (socle technique) ;
- les **Phases 5 et 6 enchaînées sans interruption**, parce que les politiques RLS dépendent de l'identité des utilisateurs ;
- une **Phase 11** de pilote avec de vraies agences.

Pour que les données fictives des Phases 3 et 4 ne soient pas du travail perdu, elles respectent **exactement** le modèle du §6 et passent par la même interface de dépôt que l'implémentation Supabase (ADR 015).

| # | Phase | Livrable principal | Dépend de |
|---|---|---|---|
| 0 | Socle technique | Projet initialisé, outillage, CI verte | — |
| 1 | Analyse et plan | Ce document validé | — |
| 2 | Références visuelles | Charte et page de démonstration des composants | 0, captures |
| 3 | Interface | Toutes les pages navigables (données fictives signalées) | 2 |
| 4 | Interactivité | Formulaires, filtres, workflows, calculs fonctionnels (dépôt fictif) | 3 |
| 5 | Base de données | Migrations, RLS, Storage, tests pgTAP, dépôt Supabase | 1 |
| 6 | Authentification | Comptes, agences, invitations, rôles ; données fictives retirées | 5 |
| 7 | Sécurité et robustesse | Durcissement, concurrence, erreurs, audit | 6 |
| 8 | Landing | Pages publiques | 2 (peut avancer en parallèle) |
| 9 | Tests de bout en bout | Suites complètes vertes | 7, 8 |
| 10 | Déploiement | Préproduction puis production vérifiées | 9 |
| 11 | Pilote | Retours de 2 à 3 agences, corrections, lancement | 10 |

**Définition de « terminé »**, valable pour toute fonctionnalité :

- validation Zod côté serveur ;
- garde de permission ;
- politique RLS et son test ;
- états de chargement, vide et erreur ;
- vérification sur mobile 360 px ;
- textes dans `fr.json` ;
- audit si l'opération est sensible ;
- tests au niveau adapté.

---

### Phase 0 — Socle technique

**Tâches**

- Vérifier les prérequis : Node.js LTS, pnpm, Git, Docker Desktop (WSL 2 sous Windows), CLI Supabase.
- `git init` et création du dépôt.
- Next.js (App Router, `src/`, TypeScript strict), Tailwind v4, initialisation de shadcn/ui, Lucide, next-intl.
- ESLint, Prettier, Vitest, Playwright, structure des dossiers du §5.
- `env.ts`, `.env.example`, `supabase init`.
- Workflow CI, `README.md`, premiers ADR.

**Critères de validation**

- `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm e2e` (test minimal) passent en local et en CI.
- Les versions réellement installées sont consignées.
- Aucun secret dans le dépôt.

### Phase 1 — Analyse et plan *(en cours)*

**Critères de validation** : vous validez explicitement ce document et tranchez les décisions du §18.

### Phase 2 — Analyse des références visuelles

**Tâches**

- Analyser vos captures : grille, espacements, couleurs, typographie, composants, interactions visibles.
- Traduire en jetons de design (variables CSS, `@theme` Tailwind), échelle typographique, rayons, ombres.
- Établir la table de correspondance des statuts.
- Intégrer le logo SVG.
- Documenter dans `docs/design/DESIGN_SYSTEM.md` toutes les décisions prises là où les captures ne montrent rien.
- Créer une page de démonstration des composants, accessible en développement uniquement.

**Critères de validation**

- Vous validez la page de démonstration.
- Contrastes AA vérifiés.
- Chaque composant présente ses états (survol, focus, désactivé, chargement, erreur).
- Rendu correct à 360 px.

### Phase 3 — Construction de l'interface

**Tâches**

- AppShell et navigation, toutes les pages du §10, composants partagés.
- Données fictives **typées selon le modèle**, chargées uniquement lorsque `DATA_SOURCE=mock`, avec le bandeau « Données de démonstration ».
- États vides, squelettes, `error.tsx` et `not-found.tsx`.

**Critères de validation**

- Toutes les routes sont navigables, sans erreur dans la console.
- Chaque bouton fonctionne ou est **désactivé avec une explication** : jamais de faux succès.
- Test Playwright qui ouvre chaque route.
- Lighthouse mobile : ≥ 85 en performance et ≥ 95 en accessibilité sur 3 pages clés.

### Phase 4 — Interactivité et workflows

**Tâches**

- Interfaces de dépôt et implémentation fictive (en mémoire, **non persistée**, signalée comme telle).
- Formulaires React Hook Form + Zod (mêmes schémas que le serveur).
- Recherche, filtres et tris synchronisés avec l'URL.
- Moteur de règles de workflow (fonctions pures), calculs financiers (fonctions pures), correspondance des checklists.
- Calendrier, tâches, éditeur de message avec aperçu, lien WhatsApp réel.
- Brouillons locaux, confirmations, notifications.

**Critères de validation**

- Chaque action importante produit un résultat visible.
- Les cas financiers de test passent : paiements partiels, remboursement, trop-perçu, prestations annulées, deux devises sur deux dossiers.
- Couverture ≥ 90 % sur les règles et les calculs.
- Aucun bouton important sans comportement.

### Phase 5 — Base de données Supabase

**Tâches**

- Supabase local, migrations du §6.8, RLS, bucket et politiques Storage, cron.
- Génération des types TypeScript.
- Implémentation Supabase des dépôts.
- `seed.sql` de développement (2 agences fictives, un utilisateur par rôle).
- Suites pgTAP.

**Critères de validation**

- `supabase db reset` fonctionne à partir de zéro.
- **Toutes les suites pgTAP sont vertes**, y compris « aucune table sans RLS » et l'isolation entre agences.
- Advisors Supabase sans alerte critique.
- L'application compile avec l'implémentation Supabase.

### Phase 6 — Authentification et appartenance à une agence

**Tâches**

- Inscription, connexion, déconnexion, mot de passe oublié et réinitialisation, `/auth/confirm`.
- Proxy de session, `/onboarding` (`create_organization`), invitations par e-mail, gestion des rôles.
- Gardes serveur, modèles d'e-mails Auth en français.
- **Retrait des données fictives** de l'application.

**Critères de validation**

- Tests E2E des parcours d'authentification (e-mails lus dans la boîte de test locale).
- Accès interdits vérifiés :
  - visiteur non connecté → `/login` ;
  - agent → pas d'accès à `/team` ni `/settings` ;
  - autre agence → 404.
- Invitation expirée refusée ; dernier propriétaire protégé.
- **Recommandation** : premier déploiement de **préproduction** (Vercel + projet Supabase dédié, données fictives uniquement) pour détecter tôt les problèmes de configuration.

### Phase 7 — Sécurité et robustesse

**Tâches**

- Revue de toutes les Server Actions et RPC avec la liste de contrôle du §12.
- En-têtes HTTP et CSP, limitation de débit, idempotence et verrous optimistes partout où ils sont nécessaires.
- Correspondance des erreurs, Sentry, durcissement des envois de fichiers.
- Audit des téléchargements et des exports.
- Expérience en cas d'erreur réseau, tests de concurrence.
- `pnpm audit`, gitleaks, rédaction de `docs/SECURITY.md`.

**Critères de validation**

- Tous les tests critiques sont verts.
- Aucune vulnérabilité de dépendance de gravité haute.
- Liste de contrôle de sécurité entièrement cochée, avec les preuves (tests) associées.

### Phase 8 — Landing page

**Tâches**

- Sections : problème, solution, fonctionnalités, avantages, formules (prix fixés par vous), FAQ (dont « SELECT Agency garantit-il un visa ? — Non, les décisions relèvent des autorités compétentes. »), appel à l'action (essai, demande de démonstration).
- Métadonnées SEO, sitemap, robots.

**Critères de validation**

- **Aucune affirmation invérifiable** : pas de faux clients, faux témoignages, faux logos de partenaires, faux chiffres ni intégration inexistante.
- Lighthouse ≥ 90.
- Pages légales marquées « à valider juridiquement ».
- Le formulaire de démonstration fonctionne, avec limitation de débit.

### Phase 9 — Tests de bout en bout

**Parcours testé** :

1. Création d'un compte.
2. Création d'une agence.
3. Connexion.
4. Création d'un client.
5. Création d'un dossier.
6. Ajout de documents.
7. Mise à jour de l'étape (avec justificatif).
8. Création d'un rendez-vous.
9. Enregistrement d'un paiement et génération du reçu.
10. Consultation du tableau de bord (chiffres cohérents avec les étapes précédentes).
11. Vérification des permissions par rôle.
12. Déconnexion et reconnexion.

**Plus** une suite d'isolation entre l'agence A et l'agence B :

- URL directe → 404 ;
- recherche globale sans fuite ;
- lien de téléchargement refusé ;
- rapports cloisonnés.

**Critères de validation** : tout est vert sur ordinateur et sur mobile, sur 3 exécutions consécutives sans test instable.

### Phase 10 — Déploiement

Voir le §15.

**Critères de validation**

- La préproduction est entièrement vérifiée avant la production.
- Tests de fumée réussis **sur l'environnement réel**.
- Sauvegardes actives et restauration testée ; supervision active ; procédure de retour arrière documentée.
- Je ne déclare déployé ou testé que ce que j'ai réellement exécuté, avec les preuves.

### Phase 11 — Pilote

**Tâches**

- 2 à 3 agences pilotes, idéalement de pays différents.
- Accompagnement au démarrage, collecte des retours, correction des irritants.
- Ajustement des modèles de départ (workflows, checklists, moyens de paiement) d'après leurs pratiques réelles.

**Critères de validation** : les agences pilotes utilisent l'outil au quotidien pendant au moins 4 semaines, et les retours bloquants sont traités avant le lancement commercial.

---

## 15. Déploiement

### 15.1 Environnements

| Environnement | Application | Base | Données |
|---|---|---|---|
| Local | `pnpm dev` | Supabase CLI (Docker) | Seed fictif |
| Préproduction | Vercel (déploiements de prévisualisation + branche `staging`) | Projet Supabase dédié | Fictives uniquement, **jamais de vraies données clients** |
| Production | Vercel (domaine principal, région cdg1) | Projet Supabase **Pro**, eu-west-3 | Réelles |

Les projets Supabase gratuits sont mis en pause après une semaine d'inactivité et n'ont pas de sauvegarde quotidienne : la formule gratuite ne convient pas à la production.

### 15.2 Variables d'environnement

| Variable | Exposition |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou clé `anon` historique) | Navigateur |
| `SUPABASE_SECRET_KEY` (ou `service_role` historique) | **Serveur uniquement** |
| `APP_URL`, `DOCUMENT_ENCRYPTION_KEY`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `SENTRY_DSN`, `CRON_SECRET` | Serveur uniquement |
| `DATA_SOURCE` | `supabase` obligatoire en préproduction et en production (vérifié au build) |

### 15.3 Pipeline

1. Une migration est créée en local (`supabase migration new`), puis testée avec `db reset` et pgTAP.
2. Pull request → CI complète → revue.
3. Fusion sur `main` → `supabase db push` vers la **préproduction** (CI, jeton d'accès) → déploiement Vercel → tests de fumée.
4. **Promotion en production** par validation manuelle (environnement protégé GitHub) :
   1. sauvegarde vérifiée ;
   2. migrations ;
   3. déploiement de l'application ;
   4. tests de fumée sur la production.
5. Retour arrière :
   - application : retour instantané Vercel ;
   - base : migration corrective, ou restauration (option de restauration à un instant donné) en dernier recours.

### 15.4 Configuration de production

**Supabase Auth**

- URL du site et liste de redirections strictes (domaine de production ; prévisualisations autorisées seulement en préproduction).
- **SMTP personnalisé** : le SMTP par défaut de Supabase est réservé aux tests.
- Modèles d'e-mails en français, confirmation e-mail activée, politique de mot de passe, captcha sur l'inscription (Cloudflare Turnstile, recommandé).

**Domaine**

- HTTPS.
- SPF, DKIM et DMARC pour le domaine d'envoi des e-mails.

**Supervision**

- Sentry, journaux Vercel et Supabase, alertes d'erreurs.

**Liste de vérification avant ouverture**

- Advisors propres.
- RLS vérifiée.
- Bucket privé.
- Clé de chiffrement sauvegardée hors de l'application : sa perte rendrait les numéros de passeport illisibles.
- Restauration testée.
- Pages légales validées.

---

## 16. Intégrations futures

Aucune n'est présentée comme opérationnelle tant qu'elle n'est pas configurée et testée.

| Intégration | Usage | Prérequis | Horizon |
|---|---|---|---|
| E-mail transactionnel (Resend recommandé ; Postmark ou Brevo possibles) | Notifications, reçus, invitations | Compte, domaine vérifié (SPF/DKIM) | **MVP** (nécessite votre configuration) |
| API WhatsApp Business (Cloud API de Meta) | Envoi automatisé, accusés de réception | Vérification de l'entreprise auprès de Meta, numéro dédié, modèles approuvés, consentement, tarification de Meta à vérifier | V2 |
| SMS (par exemple Africa's Talking, Twilio, opérateurs locaux) | Rappels hors connexion Internet | Compte, identifiant d'expéditeur, coûts par pays | V2 |
| Paiement en ligne (agrégateurs à évaluer : CinetPay, PayDunya, FedaPay, Kkiapay, Flutterwave, Paystack ; API mobile money directes) | Acomptes et soldes payés en ligne | Contrats marchands par pays, webhooks signés, rapprochement. Paiement sur page hébergée par le prestataire : aucune donnée de carte chez nous. | V2 |
| Calendrier (ICS, Google, Outlook) | Agenda des conseillers | OAuth (synchronisation) | ICS en V1.1, synchronisation en V2 |
| Antivirus des fichiers | Sécurité des envois | Service d'analyse (Edge Function ou service tiers) | V1.1 |
| Signature électronique | Contrats de prestation | Prestataire reconnu localement | V2 |
| IA : classement de documents, lecture MRZ, résumé de dossier, aide à la rédaction | Gain de temps | Consentement, contrat de sous-traitance avec le fournisseur, minimisation des données, **validation humaine systématique** | V2 |
| Exports comptables, facturation certifiée | Conformité fiscale | Analyse par pays avec un expert-comptable | V1.1 (exports) / V2 (certifiée) |
| Portail client | Le client suit son dossier et envoie ses pièces | Surface de sécurité supplémentaire (comptes externes) | V2 (lien d'envoi sécurisé dès la V1.1) |

---

## 17. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Fuite de données entre agences | Critique | RLS, clés composites, tests pgTAP et E2E systématiques, aucune clé secrète dans les parcours |
| Complexité et lenteur des politiques RLS | Élevé | Fonctions d'aide, `(select auth.uid())`, index sur `organization_id`, Advisor de performance |
| Pas de transaction dans le client JavaScript de Supabase | Élevé | RPC transactionnelles pour toute écriture composée |
| Limite de 4,5 Mo par requête sur Vercel | Élevé | Envoi direct vers Storage par URL signée |
| Évolutions rapides de Next.js (proxy, cache) | Moyen | Versions figées, documentation officielle, ADR |
| Erreurs de calcul entre devises | Élevé | Entiers, une devise par dossier, aucune somme entre devises, tests |
| Modèle de workflow modifié pendant des dossiers en cours | Moyen | Copie du modèle dans chaque dossier |
| Appareils modestes, réseau instable | Élevé | Budgets de performance, compression, brouillons, idempotence, tests réseau lent |
| Délivrabilité des e-mails | Moyen | SMTP personnalisé, SPF/DKIM/DMARC |
| Dérive du périmètre (11 modules) | Élevé | MVP strict (§3), V1.1 alimentée par les pilotes |
| Facturation fiscale certifiée obligatoire dans certains pays | Moyen | Reçus internes clairement libellés ; analyse par pays avant d'élargir le produit |
| Cadre légal des données et transferts hors du pays | Élevé | Avis juridique, contrat de sous-traitance, information des personnes, rétention configurable |
| Perception de « promesse de visa » | Élevé (réputation, juridique) | Vocabulaire contrôlé, justificatifs obligatoires, mentions sur la landing et dans les messages |
| Environnement Windows (Docker, chemin avec espace) | Faible | Docker Desktop + WSL 2, projet dans `C:\dev\select-agency` |
| Perte de la clé de chiffrement | Élevé | Conservation hors de l'application dans un coffre de secrets, procédure de rotation documentée |

---

## 18. Décisions à valider et éléments à fournir

### 18.1 Décisions (recommandation en gras)

1. **Version de Next.js** : **dernière version stable** (15.x ou 16.x) plutôt que 14.
2. **Visibilité des agents par défaut** : **uniquement leurs dossiers** (modifiable par agence), ou tous les dossiers.
3. **Région d'hébergement** : **Paris** (Supabase eu-west-3, Vercel cdg1).
4. **Fournisseur d'e-mails** : **Resend**, ou un autre de votre choix.
5. **Commissions** : **en V1.1**, ou dès le MVP.
6. **Pays pilote(s)** pour régler les modèles de départ : à indiquer (par exemple le Cameroun et la Côte d'Ivoire).
7. **Emplacement du projet** : **`C:\dev\select-agency`**, ou le dossier actuel.

### 18.2 Éléments à fournir

| Élément | Quand |
|---|---|
| Captures d'écran de référence | Phase 2 |
| Logo en **SVG** (ou PDF/AI vectoriel), codes couleur exacts, police du logo si elle existe | Phase 2 |
| Formules tarifaires et prix (par devise) | Phase 8 |
| Comptes : GitHub, Supabase, Vercel, fournisseur d'e-mails ; nom de domaine et accès DNS | Phases 0, 6 et 10 |
| Textes légaux relus par un juriste (confidentialité, conditions, contrat de sous-traitance) | Avant la Phase 10 |
| Une ou deux agences partenaires prêtes à décrire leurs démarches réelles, puis à tester | Idéalement dès la Phase 4, au plus tard en Phase 11 |

---

*Fin du plan — version 1.0. À votre validation, je démarre la Phase 0, puis la Phase 2 dès réception des captures d'écran.*
