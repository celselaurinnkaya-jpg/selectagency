# SELECT Agency

**La gestion intelligente des agences de voyages.** Logiciel de gestion (SaaS) pour les agences qui accompagnent
des clients dans leurs projets de visa, d'études à l'étranger, de voyage et de démarches administratives.

> **État actuel : application connectée à Supabase (Phases 5 et 6 du plan), en préparation du pilote.**
> Comptes, agences, rôles, données et pièces des clients sont enregistrés dans Supabase, cloisonnés
> par agence (RLS). Avant toute donnée réelle : projet Supabase de production (formule Pro, sauvegardes),
> e-mails personnalisés (SMTP) et politique de confidentialité validée.

Le plan complet est dans [docs/PLAN_IMPLEMENTATION.md](docs/PLAN_IMPLEMENTATION.md), la charte dans
[docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md).

## Démarrer

Prérequis : Node.js 24 (LTS), npm et un projet Supabase (le plan gratuit suffit pour le développement).
Docker n'est pas nécessaire.

1. **Créer le projet** sur [supabase.com](https://supabase.com) (région conseillée : Paris, eu-west-3).
2. **Configurer l'application** : copier `.env.example` en `.env.local`, puis renseigner l'URL du projet et
   la clé publique (*Project Settings → API Keys*). La clé secrète n'est pas nécessaire.
3. **Créer les tables et régler l'authentification** (aucun mot de passe de base n'est demandé) :

   ```bash
   npm install
   npm run db:login                          # ouvre le navigateur, puis recopier le code affiché
   npm run db:link -- --project-ref <identifiant-du-projet>
   npm run db:push                           # applique supabase/migrations
   npx supabase config diff                  # vérifier ce qui changerait, puis :
   npx supabase config push                  # adresses autorisées, longueur du mot de passe
   npm run dev                               # http://localhost:3000
   ```

   Ne jamais coller le SQL des migrations dans l'éditeur SQL de Supabase : l'historique des migrations
   resterait vide et `db:push` échouerait. Si c'est déjà fait, marquer les migrations correspondantes comme
   appliquées : `npx supabase migration repair --status applied <versions…> --linked`.

4. Ouvrir l'application, **créer un compte**, confirmer l'adresse e-mail, puis créer son agence (ou essayer
   l'agence de démonstration si `DEMO_DATA_ENABLED=true`).

   Le service d'e-mails intégré à Supabase n'écrit qu'aux membres de l'équipe du projet Supabase, quelques
   fois par heure : pour inscrire d'autres personnes (collègues invités, agences pilotes), configurer un
   SMTP (*Authentication → Emails → SMTP Settings*, par exemple Brevo ou Resend).

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Compilation de production (vérifie aussi les règles de rendu de Next.js) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript (mode strict) |
| `npm test` | Tous les tests : règles métier et base de données |
| `npm run db:test` | Tests de la base seule : migrations, RLS, fonctions (PGlite, sans Docker) |
| `npm run db:push` | Applique les nouvelles migrations au projet Supabase lié |

## Ce qui fonctionne

- **Comptes** : inscription avec confirmation de l'adresse e-mail, connexion, mot de passe oublié,
  déconnexion. Les pages de l'espace de travail sont réservées aux personnes connectées.
- **Agences** : création de l'agence à la première connexion (la personne devient propriétaire) ;
  agence de démonstration remplie de données fictives, que l'on peut quitter à tout moment.
- **Équipe** : invitation par lien personnel (valable 7 jours, à transmettre par e-mail ou WhatsApp),
  rôles propriétaire, administrateur, agent, comptable et lecture seule, appliqués par la base.
- **Clients** : liste, recherche, fiche, création et modification, alerte de doublon, suppression réservée
  aux responsables (impossible si le client a des dossiers). Le numéro complet de la pièce d'identité est
  stocké à part, lisible par les responsables et les agents seulement.
- **Dossiers** : création (copie du modèle d'étapes et de la checklist, numéro attribué par la base),
  changement d'étape avec niveau de preuve, protection contre deux modifications simultanées.
- **Documents** : envoi des fichiers (PDF ou photo, 10 Mo au maximum) dans un stockage privé, ouverture
  par lien temporaire, vérification interne (« vérifié par l'agence » ou « à corriger »).
- **Finance** : prestations convenues, encaissements (espèces, Mobile Money, virement) répartis sur les
  prestations, numéro de reçu unique et sans trou, reçus imprimables. Le rôle « lecture seule » ne voit
  aucun montant.
- Tâches, tableau de bord, rapports, recherche, paramètres de l'agence, message WhatsApp préparé
  (envoi manuel, noté « préparé » dans l'historique).

## Ce qui n'est pas encore disponible

- enregistrer une dépense ou un rendez-vous, exporter en CSV (actions visibles, désactivées) ;
- annuler un paiement ;
- envoyer des e-mails depuis l'application (seuls les e-mails de compte partent, par Supabase) ;
- abonnements payants des agences, WhatsApp IA.

## Organisation du code

```
supabase/
├─ migrations/         Tables, RLS, fonctions et stockage (à appliquer avec npm run db:push)
└─ tests/              Tests de la base avec PGlite (reproduction minimale de Supabase)
src/
├─ app/(auth)/         Connexion, inscription, mot de passe, création d'agence, invitation
├─ app/(app)/          Espace de travail (en-tête, menu, bandeau de démonstration)
├─ app/auth/confirm/   Liens reçus par e-mail
├─ proxy.ts            Rafraîchit la session et protège l'espace de travail (Next.js 16)
├─ features/<module>/  Lectures (queries.ts), écritures (actions.ts), règles métier et formulaires
└─ lib/                auth/ (session, droits), data/ (lecture Supabase, colonnes), supabase/ (clients)
```

Règles à respecter :

- toute lecture passe par `readAgency()` ou `getAgencyContext()` (src/lib), qui vérifient la session côté
  serveur ; chaque page enveloppe son contenu dans un `<Suspense>` (Cache Components) ;
- toute écriture de plusieurs tables passe par une fonction SQL (une seule transaction) ;
- une modification du schéma se fait par une **nouvelle** migration (`npx supabase migration new <nom>`),
  jamais en modifiant une migration déjà appliquée ;
- les listes de colonnes lues sont dans `src/lib/data/rows.ts` : le test de la base vérifie qu'elles existent.
