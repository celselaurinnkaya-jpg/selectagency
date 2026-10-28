# SELECT Agency

**La gestion intelligente des agences de voyages.** Logiciel de gestion (SaaS) pour les agences qui accompagnent
des clients dans leurs projets de visa, d'études à l'étranger, de voyage et de démarches administratives.

> **État actuel : prototype d'interface sur données fictives (Phase 3 du plan, début de Phase 4).**
> Il n'y a encore ni base de données, ni authentification, ni stockage de fichiers. Les données de
> démonstration vivent en mémoire sur le serveur local et sont perdues à chaque redémarrage.
> **Ne jamais déployer cette version en production** et n'y saisir aucune donnée réelle.

Le plan complet est dans [docs/PLAN_IMPLEMENTATION.md](docs/PLAN_IMPLEMENTATION.md), la charte dans
[docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md).

## Démarrer

Prérequis : Node.js 24 (LTS) et npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Compilation de production (vérifie aussi les règles de rendu de Next.js) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript (mode strict) |
| `npm test` | Tests unitaires (Vitest) |

Le bouton **« Réinitialiser les données »** du bandeau jaune remet la démonstration dans son état d'origine.

## Ce qui fonctionne

- Tableau de bord calculé à partir des données (aucun chiffre écrit en dur), avec filtre de période.
- Clients : liste, recherche, filtres, fiche détaillée, création avec validation du téléphone selon le pays
  et alerte de doublon (jamais de fusion automatique).
- Dossiers : création (copie du modèle d'étapes et de la checklist), liste, vue « par responsable »,
  fiche à 8 onglets, changement d'étape avec niveau de preuve obligatoire pour les étapes externes
  (« déclaré » avec source, ou « confirmé » avec référence du justificatif), retour en arrière motivé,
  clôture avec contrôle du solde.
- Documents : vérification interne (« vérifié par l'agence » ou « à corriger » avec commentaire), ajout
  de pièces à la liste, alertes d'expiration.
- Tâches : création, case à cocher, retards, filtre « mes tâches ».
- Finance : synthèse par devise (frais de l'agence séparés des fonds destinés à des tiers), paiements,
  dépenses, reçus imprimables.
- Message WhatsApp préparé à partir d'un modèle : l'agent l'envoie lui-même, et l'historique le note
  « préparé, envoi manuel ».
- Rapports, équipe et rôles, paramètres de l'agence, modèles d'étapes et checklists (consultation).

## Ce qui n'est pas encore disponible

Ces actions sont visibles mais désactivées, avec la raison affichée :

- enregistrer un paiement, une dépense ou un rendez-vous (Phase 4) ;
- téléverser des fichiers (stockage sécurisé, Phase 5) ;
- exporter en CSV (Phase 5) ;
- inviter un collaborateur, se connecter ou se déconnecter (Phase 6) ;
- envoyer des e-mails (un fournisseur reste à configurer).

## Organisation du code

```
src/
├─ app/(app)/          Pages de l'espace de travail (cadre commun : en-tête, menu, bandeau démo)
├─ app/page.tsx        Page d'accueil publique provisoire
├─ components/         brand/ (logo), layout/ (cadre), shared/ (composants communs), ui/ (shadcn/ui)
├─ features/<module>/  Lectures (queries.ts), écritures (actions.ts), règles métier et formulaires
└─ lib/                Types métier, libellés, mise en forme, périodes, données de démonstration
```

Les écrans ne lisent les données qu'au travers des `queries.ts` et `actions.ts` de chaque module. En
Phase 5, seules ces fonctions changeront pour lire et écrire dans Supabase.

Le projet utilise Next.js 16 avec Cache Components : toute lecture de données passe par `readDb()`
(qui appelle `connection()`), et chaque page enveloppe son contenu dans un `<Suspense>`.
