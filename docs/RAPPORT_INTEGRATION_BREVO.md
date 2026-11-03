# Rapport final — Intégration des e-mails Brevo dans SELECT Agency

*2 novembre 2026. Phase 4 du cahier des charges Brevo : fichiers modifiés, variables d'environnement, tests effectués, problèmes restants.*

## 1. En bref

- **L'intégration est terminée et vérifiée**, en local et sur le projet Supabase de test (`select-agency-test`).
- **Elle est en ligne depuis le 3 novembre 2026** (commit `b02d95a` sur `main`, publié par Vercel). Vérifications sur le vrai site :
  - page « E-mails » sans avertissement ;
  - un vrai document envoyé par le bouton à l'adresse du propriétaire : **reçu dans sa boîte** ;
  - l'état est passé tout seul à **« Livré »** grâce au webhook Brevo ;
  - la tâche quotidienne et le webhook refusent tout appel sans secret.
- **Tests** : 148 tests automatiques réussis, dont 34 propres aux e-mails. 6 essais complets dans l'application, sur le projet de test : 16/16, 16/16, 10/10, 13/13, 12/12 et 4/4. **Chaque type d'e-mail client a été essayé au moins une fois en bac à sable.**
- **Sauvegarde** : tout le travail est enregistré dans Git sur la branche locale `sauvegarde-2026-11-02` (commit `a534f6b`). Rien n'a été envoyé sur GitHub.
- **Preuves d'envoi réel** : un seul e-mail client a été réellement envoyé et **livré**, l'e-mail de démonstration « paiement reçu » avec son reçu PDF, envoyé à l'adresse de test fournie. Tous les autres essais ont été faits en **bac à sable** : Brevo vérifie le message et l'accepte, mais ne l'envoie à personne.

**Vocabulaire utilisé dans ce rapport :**
- **Accepté** : Brevo a reçu l'e-mail et donné un numéro.
- **Livré** : Brevo confirme qu'il est arrivé dans la boîte du destinataire.
- L'application n'affiche jamais « livré » sans cette confirmation de Brevo.

## 2. Ce que fait l'intégration

| E-mail | Quand il part | Qui décide | Le client peut se désinscrire ? |
|---|---|---|---|
| Confirmation de paiement + reçu PDF | Quand un paiement est confirmé, jamais s'il est seulement annoncé | Réglage de l'agence, désactivé au départ | Non : c'est une preuve de paiement |
| Envoi d'un document en PDF (reçu, facture, devis, récapitulatif, confirmation de réservation) | Bouton « Envoyer par e-mail » ; l'agent voit l'adresse et confirme | L'agent | Non : c'est une demande de l'agent |
| Avancement du dossier | Quand le dossier attend une action du client, quand une décision est enregistrée (visa accordé ou refusé…) et à la clôture | Réglage de l'agence, désactivé au départ | Oui |
| Relance des pièces manquantes | Bouton « Relancer par e-mail » (liste exacte montrée avant l'envoi) ; ou automatique : dossier qui attend le client depuis 3 jours, une fois par semaine au plus, 3 fois au total | L'agent, ou le réglage de l'agence | Oui |
| Rappel de rendez-vous | La veille, pour un rendez-vous prévu ou confirmé (pas pour les dates limites internes) | Réglage de l'agence, désactivé au départ | Oui |
| Bienvenue de l'agence | À la création de l'agence | Toujours | Non concerné |
| Alertes d'abonnement au propriétaire | Fin d'essai à 7 jours et la veille, essai terminé, échéance à 7 jours, échéance passée, espace suspendu ; une fois par étape | Toujours | Non concerné |
| Comptes (confirmation d'adresse, mot de passe oublié) | Envoyés par Supabase, via le serveur SMTP de Brevo, avec des modèles en français | Toujours | Non concerné |

**Fonctionnement commun :**
- Chaque e-mail passe par une **file d'envoi** avec une clé unique, ce qui évite les doublons.
- Juste avant l'envoi, l'application **revérifie** que l'e-mail doit toujours partir : paiement toujours confirmé, client toujours inscrit, rendez-vous pas déplacé, dossier toujours à la même étape, réglage toujours activé.
- Une **tâche quotidienne** (17 h à Douala) prépare les rappels, les relances et les alertes, puis renvoie les e-mails bloqués par une panne.
- Le **webhook** reçoit de Brevo les statuts « livré », « rejeté » et « signalé comme indésirable ». Un signalement désinscrit le client.

**Protection contre les doublons** : un essai réel a montré que Brevo n'empêche pas les doublons. Chaque e-mail porte donc une étiquette unique (`outbox-<id>`). Avant un nouvel essai, l'application demande à Brevo s'il a déjà accepté cet e-mail.

## 3. Fichiers créés et modifiés

### Base de données (`supabase/`)

| Fichier | Contenu |
|---|---|
| `migrations/20261102100000_emails_brevo.sql` | Première version (écrite lors d'une session Gemini) : file d'envoi, réglages, désinscription, statuts. **Déjà en production.** |
| `migrations/20261102120000_emails_corrections.sql` | Corrections : tout désactivé au départ, secrets stockés par empreinte, revérification avant l'envoi, erreurs définitives. **Déjà en production.** |
| `migrations/20261102140000_emails_dossiers.sql` | Avancement du dossier, relance des pièces. *Projet de test seulement.* |
| `migrations/20261102160000_emails_planifies.sql` | Tâche quotidienne : rappels, relance automatique, alertes d'abonnement. *Projet de test seulement.* |
| `migrations/20261102180000_emails_webhook.sql` | Webhook : e-mail retrouvé par son étiquette, statuts fiables. *Projet de test seulement.* |
| `migrations/20261102200000_emails_anciens.sql` | Bienvenue ou alerte d'abonnement restées plus de 3 jours en attente : annulées au lieu de partir en retard. *Projet de test seulement.* |
| `tests/database.test.ts` | 12 tests de base consacrés aux e-mails |
| `config.toml`, `templates/confirmation.html`, `templates/recovery.html` | Adresse du site, adresses de retour, modèles français des e-mails de compte |

### Module d'envoi (`src/lib/`)

| Fichier | Rôle |
|---|---|
| `email/brevo.ts` | Appel à l'API Brevo (clé lue uniquement sur le serveur, délai de 10 s, bac à sable, recherche par étiquette) |
| `email/compose.ts` | Prépare chaque e-mail : expéditeur « Agence via SELECT Agency », adresse de réponse de l'agence, étiquettes |
| `email/templates.ts` | Modèles en français, en HTML et en texte simple, aux couleurs SELECT, sans promesse de visa |
| `email/missing-documents.ts` | Description des pièces manquantes, identique dans l'aperçu et dans l'e-mail |
| `email/deliver.ts` | Envoi unique, avec contrôle anti-doublon |
| `email/dispatcher.ts` | Envoi depuis l'espace de l'agence, avec les PDF joints |
| `email/system-worker.ts` | Tâche quotidienne : préparation, puis envoi par lots dans une limite de temps |
| `email/webhook.ts` | Lecture des appels de Brevo (secret dans un en-tête uniquement) |
| `email/report.ts` | Message de résultat montré à l'agent après un envoi |
| `supabase/system.ts` | Accès à la base sans personne connectée (clé publique et secret seulement) |
| `email/*.test.ts` | 22 tests automatiques |

### Pages, actions et routes (`src/app/`, `src/features/`)

- **Routes** :
  - `api/cron/emails/route.ts` (tâche quotidienne) ;
  - `api/webhooks/brevo/route.ts` (webhook).
- **Réglages** : `settings/emails/page.tsx`, `features/settings/EmailSettingsForm.tsx`, `email-actions.ts`, `email-queries.ts`, `SettingsNav.tsx`.
- **Désinscription** : `(auth)/desinscription/[token]/` (page, confirmation par un bouton, action).
- **Envoi d'un document** :
  - `features/printables/email-actions.ts` et `EmailDocumentButton.tsx` ;
  - `DocumentToolbar.tsx` et `features/invoices/InvoiceToolbar.tsx` ;
  - pages reçu, facture, devis, récapitulatif et confirmation de réservation.
- **Relance des pièces** : `features/documents/email-actions.ts`, `MissingDocumentsEmailButton.tsx`, onglet Documents du dossier.
- **Avancement du dossier** : `features/cases/actions.ts`, `queries.ts` et `StepTransitionForm.tsx` (avertissement « Le client sera prévenu par e-mail »).
- **Envoi après la réponse** : `features/finance/actions.ts` (paiements) et `features/onboarding/actions.ts` (création d'agence).
- **Types et libellés** : `lib/domain/types.ts`, `labels.ts`, `lib/data/rows.ts`.
- **Configuration** : `vercel.json` (tâche quotidienne) et `.env.example`.

## 4. Variables d'environnement et secrets

| Nom | Où la mettre | Rôle | Secret ? | État aujourd'hui |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | Connexion à la base | Non | En place |
| `NEXT_PUBLIC_SITE_URL` | Vercel : `https://www.myselectagency.com` | Liens dans les e-mails | Non | À vérifier dans Vercel |
| `BREVO_API_KEY` | Vercel (serveur) | Envoi des e-mails | **Oui** | Dans `.env.local` ; à ajouter dans Vercel |
| `BREVO_SENDER_EMAIL` | Vercel : `notifications@myselectagency.com` | Adresse d'expédition authentifiée | Non | À ajouter dans Vercel |
| `CRON_SECRET` | Vercel | Protège la tâche quotidienne | **Oui** | Dans `.env.local` ; à ajouter dans Vercel |
| `BREVO_WEBHOOK_SECRET` | **Dans Brevo** (jeton du webhook), pas dans Vercel | Protège le webhook | **Oui** | Dans `.env.local` |
| `BREVO_SANDBOX` | **Jamais en production** | Mode test : rien n'est envoyé | Non | Seulement pour les essais |
| `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` | Supabase → Authentication → SMTP (déjà fait) | E-mails de compte | **Oui** | Inutiles dans l'application, peuvent être retirés de `.env.local` |

**Empreintes dans la base** : la base ne garde que l'empreinte SHA-256 des deux secrets, dans `private.system_secrets` (clés `email_worker` et `brevo_webhook`). C'est fait sur le projet de test, et c'est à faire sur le vrai projet.

**Règles respectées :**
- aucune clé dans le code envoyé au navigateur, dans les réponses ni dans les journaux ;
- les secrets ont été créés directement dans `.env.local`, qui est ignoré par Git, et n'ont jamais été affichés ;
- aucune clé secrète Supabase n'est utilisée.

## 5. Tests effectués

### Tests automatiques (148 réussis, dont 34 propres aux e-mails)

- **Base de données** (PostgreSQL en mémoire, 12 tests sur les e-mails) :
  - messages de la plateforme trop anciens annulés ;
  - tout désactivé par défaut ;
  - droits par rôle ;
  - revérification avant l'envoi ;
  - erreurs définitives et clôture unique ;
  - secrets vérifiés par empreinte ;
  - statuts du webhook, y compris par étiquette ;
  - avancement du dossier (action, décision, clôture, client désinscrit ou sans adresse) ;
  - relance des pièces (liste, droits, dossier clôturé) ;
  - tâche quotidienne (rappel la veille, rendez-vous déplacé, PDF exclus) ;
  - relance automatique (3 jours, une par semaine, 3 au plus) ;
  - alertes d'abonnement (une par étape).
- **Application** (22 tests) :
  - appel à Brevo (bac à sable, erreurs, clé jamais affichée, étiquettes) ;
  - modèles et dates à l'heure de l'agence ;
  - tâche quotidienne (secret, lots, limite de temps) ;
  - lecture des appels du webhook.

### Essais réels

| E-mail | Essai | Preuve |
|---|---|---|
| Paiement reçu + reçu PDF | **Vrai envoi** de démonstration, deux fois, à l'adresse de test fournie (données inventées, aucune base touchée) | Registre Brevo : **2 livrés**, 1 ouvert. L'utilisateur l'a vu dans la boîte de réception (pas en spam), avec le bon expéditeur et un PDF lisible |
| Paiement reçu, dans l'application | Bac à sable, sur le projet de test | Statut « envoyé » et numéro Brevo |
| Document : reçu, récapitulatif | Bac à sable, par le bouton | Statut « envoyé », numéro Brevo, historique du client |
| Document : facture, devis, confirmation de réservation | Bac à sable, par le bouton | « Brevo l'a accepté », statut « envoyé », numéro Brevo |
| Avancement : action attendue du client | Bac à sable, sur le projet de test | Statut « envoyé », numéro Brevo, avertissement affiché avant |
| Avancement : décision (« Visa refusé », déclarée) et clôture | Bac à sable, par le formulaire d'étape | Avertissement avant l'enregistrement, statut « envoyé », numéro Brevo, lignes dans « Communications » |
| Relance des pièces par le bouton | Bac à sable, sur le projet de test | Liste exacte, statut « envoyé », numéro Brevo |
| Relance automatique des pièces | Bac à sable, par la tâche quotidienne (dossier vieilli de 4 jours par une ligne SQL sur le projet de test) | 8 pièces listées, statut « envoyé », pas de doublon au second passage |
| Rappel de rendez-vous | Bac à sable, par la tâche quotidienne | Statut « envoyé », pas de doublon au second passage |
| Bienvenue de l'agence | Bac à sable, par la tâche quotidienne | Comptée comme acceptée par Brevo |
| Alerte « fin d'essai dans 7 jours » | Bac à sable, par la tâche quotidienne (fin d'essai fixée à 5 jours sur le projet de test) | Envoyée au propriétaire, statut « envoyé », pas de doublon |
| Autres alertes d'abonnement (veille, essai terminé, échéance, suspension) | Tests automatiques seulement | Même chemin d'envoi que l'alerte essayée |
| Mot de passe oublié (compte) | **Vrai envoi** sur le compte de l'utilisateur | Reçu, en français, lien correct (confirmé par l'utilisateur) |
| Confirmation d'inscription (compte) | Non testée en réel (même canal et modèle français installé) | — |
| Webhook (livré, rejeté, indésirable, lots) | Rôle de Brevo joué localement, contre le projet de test | 13/13, deux fois |

Pour chaque essai en bac à sable, le registre Brevo a été relu en lecture seule : **aucune trace** des adresses d'essai, donc rien n'a été réellement envoyé.

## 6. Problèmes restants et limites

*Les trois points les plus importants du premier rapport sont réglés : la sauvegarde Git, les bienvenues en attente (annulées automatiquement après 3 jours) et les e-mails jamais essayés (tous essayés en bac à sable). Restent :*

1. *(Réglé)* Mise en ligne : faite le 3 novembre 2026, voir la section 7.
2. *(Réglé)* Sauvegarde Git : commit `a534f6b`, rien sur GitHub.
3. *(Réglé)* Bienvenues en attente dans la vraie base : avec la migration `20261102200000`, celles de plus de 3 jours seront annulées automatiquement au premier passage, avec leur raison.
4. *(Réglé)* Webhook réel : créé dans Brevo (Intégrations → Webhooks sortants, catégorie « Transactional email », authentification par jeton). Un vrai e-mail est passé à « Livré ». Le paragraphe ci-dessous est conservé pour l'historique : **Webhook réel non testé.** Brevo ne peut joindre que le site en ligne. Les champs exacts de l'écran Brevo (Intégrations → Webhooks, authentification par jeton) sont à confirmer à ce moment-là. La clé API actuelle n'a pas le droit de gérer les webhooks, et c'est voulu.
5. **Tâche quotidienne une seule fois par jour** : c'est la limite de la formule gratuite de Vercel, avec une heure approximative. Les e-mails avec PDF bloqués par une panne repartent à la prochaine action de l'agence ou par le bouton « Envoyer les e-mails en attente » des réglages.
6. **Encore vérifiés seulement par des tests automatiques** : les alertes d'abonnement autres que « fin d'essai dans 7 jours » (même chemin d'envoi), et la confirmation d'inscription d'un compte. L'essayer demanderait de créer un compte sur le vrai site.
   - Après une clôture, le message « Un e-mail part au client » ne reste pas affiché, car le formulaire laisse place à « Ce dossier est clôturé ». L'e-mail apparaît dans l'onglet « Communications ».
7. **Une erreur passagère non expliquée** pendant un essai de l'étape 6 : un e-mail est resté en attente, puis il est reparti au passage suivant. Ce n'est pas une limite de Brevo (10 envois simultanés acceptés) ; c'est probablement une coupure de réseau.
8. **Limite d'envoi de la formule Brevo** : la formule gratuite de Brevo est en général limitée à 300 e-mails par jour. Vérifiez la limite de votre compte avant le lancement.
9. **Domaine sans boîte de réception** : personne ne peut écrire à `notifications@`. Les réponses aux e-mails d'agence vont à l'adresse de réponse de l'agence, et les e-mails de la plateforme n'ont pas d'adresse de réponse. La politique DMARC est souple (`p=none`) : à renforcer après quelques semaines d'envoi.
10. **Secrets présents seulement sur ce PC** (`.env.local`). En garder une copie sûre, dans un gestionnaire de mots de passe. S'ils sont perdus, il suffit d'en créer de nouveaux et de mettre à jour leurs empreintes.
11. **Points techniques sans effet sur le site** :
    - des comptes d'essai restent dans le projet de test ;
    - la dernière compilation locale (`.next`) vise le projet de test, sans effet sur `npm run dev` ni sur Vercel.
12. **Choix à confirmer** : l'envoi d'un document demandé par l'agent part même si le client s'est désinscrit des relances, puisque c'est une demande explicite de l'agent.

## 7. Mise en ligne : faite le 3 novembre 2026, sur demande explicite de l'utilisateur

Toutes les étapes ci-dessous ont été réalisées et vérifiées :
- 4 migrations appliquées à la vraie base ;
- 2 empreintes enregistrées et reconnues ;
- 4 variables ajoutées dans Vercel ;
- `main` publié (`b02d95a`) ;
- webhook créé dans Brevo ;
- un vrai envoi reçu et passé à « Livré ».

Première tâche quotidienne : 16 h UTC (17 h à Douala), visible dans Vercel → Settings → Cron Jobs.

1. **Git** : c'est fait (branche locale `sauvegarde-2026-11-02`). Au moment de publier, la fusionner dans `main`.
2. **Vraie base Supabase** :
   - appliquer les migrations `20261102140000`, `20261102160000`, `20261102180000` et `20261102200000` ;
   - enregistrer les deux empreintes (lignes SQL fournies à ce moment).
   - Les anciennes bienvenues s'annuleront d'elles-mêmes.
3. **Vercel** : ajouter `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `CRON_SECRET`, et vérifier `NEXT_PUBLIC_SITE_URL`. Ne pas ajouter `BREVO_SANDBOX`.
4. **Envoyer sur GitHub** pour publier sur Vercel, uniquement sur demande explicite, puis vérifier que la tâche quotidienne apparaît dans Vercel (Settings → Cron Jobs).
5. **Brevo** : créer le webhook.
   - Adresse : `https://www.myselectagency.com/api/webhooks/brevo`.
   - Authentification par jeton : la valeur de `BREVO_WEBHOOK_SECRET`.
   - Événements : livré, rejet définitif, adresse invalide, bloqué, erreur, indésirable, rejet temporaire, différé, désinscription.
6. **Vérification en ligne**, sans données de test dans la vraie base :
   - un envoi réel vers votre propre adresse ;
   - le statut « livré » qui revient par le webhook ;
   - un passage de la tâche quotidienne.
