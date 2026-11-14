# Architecture du module « Agent IA » (WhatsApp Business Platform + IA)

*Phase 1 — 8 novembre 2026. Document à valider avant toute ligne de code. Suite de l'audit (journal, session 28) et du prompt `docs/PROMPT_AGENT_IA.md`.*

## 1. Principes

1. **Module séparé du WhatsApp manuel.**
   - Le WhatsApp manuel reste tel quel : bouton `wa.me`, « Préparer un message », « Noter un échange », `communication_logs`, `message_templates`.
   - Le module Agent IA a ses propres tables (`wa_*`, `ai_*`), pages, statuts et droits.
   - Seuls liens avec le reste de SELECT : `client_id` et `case_id`, et les actions CRM de la phase 7.
2. **API officielle de Meta uniquement** (Cloud API, Embedded Signup v4, webhooks signés). SELECT agit comme **Tech Provider**.
3. **Isolement par agence dans la base** (`organization_id`) : règles d'accès (RLS) sur chaque table, écritures uniquement par des fonctions contrôlées, recherche dans les connaissances filtrée dans la base.
4. **Preuves avant statuts.** Un message est « envoyé », « livré » ou « lu » seulement d'après les webhooks de Meta.
5. **L'IA n'invente rien et reste sur les services de l'agence.** C'est la règle de Meta depuis le 15 janvier 2026 et la règle de SELECT (aucune promesse de visa).
6. **Coûts maîtrisés** : quotas par formule et crédits, jamais d'« illimité ».

## 2. Place dans l'interface

Une seule entrée de menu, **« Agent IA »**, avec un sous-menu identique à celui de la page Tâches :

| Onglet | Contenu | Qui |
|---|---|---|
| **Conversations** | Boîte de réception WhatsApp de l'API : liste, non lus, recherche, médias, modes (IA automatique, assistance IA, humain), attribution, lien vers le client ou le dossier | Propriétaire, administrateur, conseiller |
| **Mes agents** | Créer, modifier, dupliquer, désactiver, supprimer, **tester** | Propriétaire, administrateur (conseiller : tester seulement) |
| **Connaissances** | Documents, textes et liens de chaque agent, état de l'indexation, recherche | Propriétaire, administrateur |
| **Modèles WhatsApp** | Modèles soumis à Meta (marketing, utilitaire, authentification) et leur approbation | Propriétaire, administrateur |
| **Statistiques** | Conversations, prospects, transferts, temps de réponse, consommation, coûts estimés | Propriétaire, administrateur, comptable |
| **Connexion WhatsApp** | Embedded Signup, état, erreurs, reconnexion, déconnexion | Propriétaire, administrateur |

Le rôle « lecture seule » ne voit pas le module, car les conversations contiennent des données personnelles. Sur la fiche client, un onglet à part, **« Agent IA »**, montrera plus tard ses conversations ; elles ne seront jamais mêlées à l'onglet « Communications ».

## 3. Flux

### 3.1 Connexion d'un numéro (Embedded Signup)
1. Un responsable clique sur « Connecter mon WhatsApp ». La fenêtre de Meta s'ouvre (kit JavaScript de Facebook, identifiant de configuration de SELECT). L'agence crée ou choisit son compte WhatsApp Business et son numéro. La **Coexistence** permet de garder l'application WhatsApp Business, si le compte y a droit.
2. Meta renvoie un code à usage unique, l'identifiant du compte (WABA) et l'identifiant du numéro.
3. Le serveur de SELECT échange le code contre le jeton de l'agence (secret de l'application, côté serveur uniquement) et **range ce jeton dans Supabase Vault**. Il abonne ensuite l'application aux webhooks de ce compte et enregistre le numéro.
4. La ligne `wa_accounts` passe à « connecté ». Les erreurs sont gardées et affichées en clair.

### 3.2 Message entrant
1. Meta appelle `POST /api/webhooks/whatsapp`. Le serveur vérifie la signature `X-Hub-Signature-256` (HMAC-SHA256 avec le secret de l'application) et refuse tout message non signé.
2. L'événement est enregistré dans `wa_webhook_events` avec une **clé unique** (identifiant de Meta) : un même message reçu deux fois n'est traité qu'une fois. Réponse 200 immédiate.
3. Juste après la réponse (`after()`), le message est rattaché à l'agence par l'identifiant du numéro, puis le contact et la conversation sont créés ou mis à jour. Le message est stocké, et un média est téléchargé dans un stockage privé.
4. Selon le mode de la conversation :
   - **IA automatique** : une tâche `ai_jobs` est créée ;
   - **assistance** ou **humain** : notification du conseiller attribué.

### 3.3 Réponse de l'IA
1. Le travailleur lit la tâche et charge l'agent, la fin de la conversation et les **extraits trouvés dans les connaissances de cet agent**. La recherche par le sens (pgvector) est filtrée par agence et par agent dans une fonction de la base.
2. Le modèle reçoit :
   - les consignes système de SELECT : rester sur les services de l'agence, ne rien inventer, citer ses sources, proposer un conseiller en cas de doute ;
   - les consignes de l'agence ;
   - les extraits ;
   - la conversation, **marquée comme donnée et non comme consigne**.
3. Les **outils** du modèle sont limités à la conversation en cours (phase 7). Une action sensible devient une *proposition* à valider (`ai_actions`).
4. La réponse va dans la file d'envoi (`wa_messages`, statut « en file »). Une demande de transfert, ou une information introuvable, déclenche le transfert (§ 3.5).
5. La consommation de chaque appel est notée dans `ai_runs` (jetons, coût, durée, résultat).

### 3.4 Envoi
1. Le travailleur envoie le message par l'API Graph (`POST /{phone_number_id}/messages`). Il garde l'identifiant de Meta, avec une clé d'envoi unique pour ne jamais envoyer deux fois.
2. Hors de la fenêtre de 24 heures, seul un **modèle approuvé** peut partir ; l'écran l'explique.
3. Les webhooks de statut de Meta mettent à jour le message : envoyé, livré, lu ou échec, avec la raison.

### 3.5 Transfert à un conseiller
- **Déclencheurs** :
  - le client demande un humain, est mécontent ou veut négocier ;
  - la demande est complexe, ou l'information est introuvable ;
  - le client veut finaliser une prestation ;
  - une règle de l'agence le prévoit.
- **Ce qui se passe** :
  - l'IA prévient le client ;
  - la conversation passe en mode **humain**, et l'IA n'envoie plus rien ;
  - un conseiller est choisi : celui de la fiche, sinon un membre **présent** d'après le module Présences, sinon un responsable ;
  - il est notifié dans l'application et par e-mail (Brevo) ;
  - un **résumé** de la conversation lui est fourni.

### 3.6 Base de connaissances
1. Fichiers PDF, Word et texte dans un stockage privé (`knowledge`), textes saisis, liens web.
2. Une tâche d'indexation extrait le texte :
   - PDF : bibliothèque `unpdf` ;
   - Word : bibliothèque `mammoth` ;
   - page web : lecture contrôlée, qui refuse les adresses internes et limite la taille et le délai.
3. Le texte est découpé en extraits d'environ 500 mots qui se chevauchent un peu. Un service calcule l'index de chaque extrait (Voyage), stocké dans `ai_knowledge_chunks`.
4. Les statuts d'indexation sont : en attente, en cours, prêt, échec avec la raison. L'historique est gardé, et chaque source peut être réindexée.

### 3.7 Testeur d'agent (phase 3, avant WhatsApp)
Dans « Mes agents », un conseiller discute avec l'agent dans SELECT. Le moteur est le même que pour WhatsApp, mais rien ne part chez Meta. On y voit les extraits utilisés, les transferts qui auraient été déclenchés et le coût de chaque réponse.

## 4. Tables prévues (phase 2)

Toutes les tables ont `organization_id`, des règles d'accès et des fonctions d'écriture contrôlées.

| Table | Rôle | Colonnes principales |
|---|---|---|
| `wa_accounts` | Numéros WhatsApp connectés | `waba_id`, `phone_number_id` (unique), numéro affiché, nom vérifié, statut, coexistence, référence du jeton dans Vault, qualité, limite d'envoi, dernière erreur, connecté par et le |
| `wa_contacts` | Personnes qui écrivent | `wa_id` (numéro), nom de profil, `client_id` (facultatif), dernier message reçu (fenêtre de 24 h), consentement marketing |
| `wa_conversations` | Fils de discussion | compte, contact, agent, **mode** (`ai`, `assist`, `human`), statut (`open`, `pending`, `resolved`), attribuée à, non lus, dernier message, `client_id`, `case_id` |
| `wa_messages` | Messages | sens, identifiant Meta (unique), type (texte, image, document, audio, modèle, interactif), texte, média, auteur (`contact`, `ai`, `member`), membre, **statut** (`queued`, `sent`, `delivered`, `read`, `failed`), erreur, clé d'envoi unique, tentatives |
| `wa_webhook_events` | Événements bruts de Meta | identifiant unique, type, reçu le, traité le, erreur (conservés 30 jours) |
| `wa_templates` | Modèles Meta | nom, langue, catégorie, contenu, statut d'approbation, motif de refus |
| `ai_agents` | Assistants | nom, avatar, rôle, modèle de départ, langues, ton, personnalité, consignes, services, sujets, horaires, règles de transfert, niveau de modèle, actif, publié le, version |
| `ai_knowledge_sources` | Sources | agent, type (fichier, texte, lien), titre, chemin, adresse ou texte, statut, erreur, nombre d'extraits, mis à jour le |
| `ai_knowledge_chunks` | Extraits indexés | source, agent, texte, `embedding vector(1024)`, position |
| `ai_jobs` | File de travail | type (réponse, suggestion, résumé, indexation), statut, tentatives, prochain essai, erreur |
| `ai_runs` | Consommation de l'IA | agent, conversation, type (`reply`, `suggest`, `summary`, `test`), fournisseur, modèle, jetons, coût, durée, résultat |
| `ai_actions` | Actions CRM de l'IA | outil, données, statut (`proposed`, `approved`, `rejected`, `done`, `failed`), décidé par, résultat |
| `ai_usage_monthly` | Totaux mensuels pour les quotas | mois, messages envoyés, réponses IA, jetons, coûts Meta et IA estimés |
| `ai_credit_ledger` | Crédits achetés ou consommés | variation, motif, paiement Stripe |

**Formules** : nouvelles colonnes de limites sur `plans` (agents, numéros, réponses IA par mois, taille des connaissances). La règle de la base existe déjà pour les options (`org_has_feature`) et sera étendue aux quotas.

## 5. Choix techniques

### 5.1 Notre moteur ou « Meta Business Agent » ?
| | Notre moteur dans SELECT | Meta Business Agent |
|---|---|---|
| Contrôle des consignes et des refus | Total | Limité aux réglages de Meta |
| Liens avec le CRM (prospects, dossiers, tâches) | Oui | Non, ou très limité |
| Choix du modèle IA | Libre, avec un fournisseur de secours | Celui de Meta |
| Coût IA par réponse | ≈ 0,001 $ avec Claude Haiku 5.5 (deux appels, § 7) | ≈ 4 à 5 centimes de dollar (Meta : 2 $ par million de jetons, « environ 4 à 5 cents par message ») |
| Travail de développement | Important | Faible |

**Recommandation : notre moteur.** Il revient environ 40 fois moins cher par réponse, il est relié au CRM, et il ne dépend pas d'un seul fournisseur.

### 5.2 Fournisseur IA
Une couche commune dans `src/lib/ai/` (fonction `generate` avec outils, et suivi des jetons) permet de changer de fournisseur sans toucher au reste.

| Option | Pour | Contre |
|---|---|---|
| **Claude Haiku 5.5** (Anthropic), par défaut | 0,10 $ par million de jetons en entrée et 0,50 $ en sortie ; outils fiables ; cache des consignes à 0,01 $ par million | Fournisseur américain : informer les clients |
| **Claude Sonnet 5.5**, pour les cas complexes et les résumés | Raisonnement plus fin | 2 $ et 10 $ par million, soit environ 20 fois Haiku |
| Fournisseur de secours (Mistral ou OpenAI) | Continuité en cas de panne, comparaison | Un compte et une clé de plus |

Transparence : ce document est rédigé par un modèle Claude. Le testeur de la phase 3 permettra de comparer honnêtement deux fournisseurs sur les vraies questions de l'agence pilote.

### 5.3 Index de recherche (embeddings)
| Option | Prix | Remarque |
|---|---|---|
| **Voyage `voyage-3.5-lite`** (recommandé) | 0,02 $ par million de jetons, 200 millions gratuits | Multilingue, conseillé par Anthropic |
| OpenAI `text-embedding-3-small` | 0,02 $ par million, d'après une source secondaire | Compte OpenAI nécessaire |
| Modèle gratuit hébergé par Supabase | Gratuit | Moins bon en français |

### 5.4 Stockage des index : **pgvector dans Supabase**
- Même base, mêmes règles d'accès, aucun nouveau fournisseur.
- Les tests PGlite savent charger pgvector.

### 5.5 File de traitement
- **Choix** : une table `ai_jobs` traitée tout de suite après la réponse au webhook (`after()`, comme les e-mails). Un **filet de sécurité chaque minute** relance les tâches en retard, grâce aux extensions `pg_cron` et `pg_net` de Supabase, qui appellent une adresse protégée par un secret.
- **Pourquoi** : la tâche planifiée de Vercel ne tourne qu'une fois par jour aujourd'hui, et ce filet fonctionne quelle que soit l'offre Vercel.
- **Autres options** : un service externe (Inngest, QStash) fait la même chose, mais ajoute un fournisseur.

### 5.6 Temps réel
- **Supabase Realtime** sur `wa_conversations` et `wa_messages`, en respectant les règles d'accès : la boîte de réception se met à jour sans recharger la page.

### 5.7 Secrets
- **Côté serveur seulement** :
  - le secret de l'application Meta et le jeton de vérification du webhook ;
  - les clés IA et Voyage ;
  - le secret du travailleur, qui existe déjà (`CRON_SECRET`).
- **Supabase Vault** : les jetons des agences, lus uniquement par une fonction protégée par le secret serveur. Le projet garde sa règle : aucune clé « maîtresse » `service_role`.

### 5.8 Sécurité de l'IA
- **Les messages des clients sont des données**, jamais des consignes.
- L'agent ne voit que la conversation en cours.
- Ses outils sont limités par une liste, et chaque action sensible est validée par un humain.
- Les réponses sont limitées en longueur, avec un nombre maximal d'appels par conversation et par heure (contre les abus).
- Les données sensibles sont masquées avant l'envoi au modèle (numéro de passeport, données bancaires).
- Nous demandons au fournisseur de ne pas conserver les données, ou le moins longtemps possible.

### 5.9 Écran de connexion
- Le kit JavaScript de Facebook est chargé **uniquement** sur l'onglet « Connexion WhatsApp ».
- Les en-têtes de sécurité du site sont ajustés pour ce seul domaine.

## 6. Droits par rôle

| Action | Propriétaire | Administrateur | Conseiller | Comptable | Lecture seule |
|---|:-:|:-:|:-:|:-:|:-:|
| Connecter ou déconnecter WhatsApp | ✔ | ✔ | — | — | — |
| Créer et modifier les agents et les connaissances | ✔ | ✔ | — | — | — |
| Tester un agent | ✔ | ✔ | ✔ | — | — |
| Lire et répondre aux conversations, prendre la main | ✔ | ✔ | ✔ | — | — |
| Valider une action proposée par l'IA | ✔ | ✔ | ✔ (sur ses conversations) | — | — |
| Modèles WhatsApp | ✔ | ✔ | — | — | — |
| Statistiques et coûts | ✔ | ✔ | — | ✔ | — |
| Console SELECT | Chiffres globaux seulement, **jamais le contenu** | | | | |

Toutes les écritures suivent l'abonnement (lecture seule quand il est suspendu) et les quotas.

## 7. Coûts prévisionnels (par agence et par mois)

**Hypothèses** :
- chaque message envoyé est une réponse dans la fenêtre de 24 heures ;
- chaque réponse IA fait en moyenne **2 appels** au modèle, d'environ 4 500 jetons en entrée et 250 en sortie chacun ;
- le modèle est Claude Haiku 5.5 ;
- les 1 000 premières réponses du mois sont gratuites chez Meta, puis facturées au tarif « utilitaire » de la zone Rest of Africa, environ **0,004 $** ;
- 1 $ vaut environ 587 FCFA (cours BCE du 6 novembre 2026).

| Messages envoyés par mois | Meta | IA (Haiku 5.5) | Total estimé |
|---|---|---|---|
| 500 | 0 $ (franchise) | ≈ 0,60 $ | **≈ 340 FCFA** |
| 2 000 | ≈ 4 $ | ≈ 2,30 $ | **≈ 3 700 FCFA** |
| 10 000 | ≈ 36 $ | ≈ 12 $ | **≈ 28 000 FCFA** |

À ajouter :
- **Modèles hors fenêtre** : environ 0,004 $ pour un utilitaire, environ 0,0225 $ pour un marketing (zone Rest of Africa).
- **Calcul des index** : négligeable, avec 200 millions de jetons gratuits chez Voyage.
- Avec Sonnet 5.5 au lieu de Haiku, le coût IA est multiplié par environ 20 (≈ 230 $ pour 10 000 messages). D'où le choix de Haiku par défaut, et de Sonnet seulement pour les cas complexes.
- **Coûts fixes** : Supabase et Vercel (offres à confirmer).

⚠️ Les tarifs Rest of Africa proviennent de sources secondaires, car la grille officielle de Meta n'est disponible qu'en fichier interactif. **Ils sont à vérifier sur la grille officielle (CSV) avant de fixer les prix de vente.** Les tarifs d'Anthropic viennent de sa page officielle (8 novembre 2026).

**Proposition de formules, à valider** :

| Formule | Agent IA |
|---|---|
| STARTER | Pas d'Agent IA (option grisée avec « Passez à PRO ») |
| PRO | 1 numéro, 1 agent, 2 000 réponses IA par mois incluses |
| BUSINESS | 1 numéro, 3 agents, 10 000 réponses IA par mois |

Au-delà, l'agence achète des crédits (par exemple des paquets de 1 000 réponses). Les frais de Meta sont payés par l'agence directement à Meta, avec sa carte.

## 8. Prérequis hors code (étape A)

1. **Vérification de l'entreprise SELECT par Meta** :
   - portefeuille Meta Business au nom de la société ;
   - documents officiels (registre du commerce, identifiant fiscal) ;
   - domaine `myselectagency.com` vérifié ;
   - adresse e-mail professionnelle.
2. **Application Meta** : cas d'usage WhatsApp, rattachée au portefeuille. Puis l'App Review, avec deux vidéos (envoi d'un message, création d'un modèle) et l'accès avancé aux deux autorisations.
3. **Pages légales publiques** : politique de confidentialité, conditions d'utilisation, suppression des données.
4. **Comptes** : Anthropic (clé API), puis Voyage en phase 4.
5. **Offre Vercel** à confirmer.
6. **Agence pilote** : un numéro WhatsApp Business et la possibilité d'ajouter une carte de paiement chez Meta.

## 9. Ordre de développement

| Phase | Contenu | Dépend de Meta ? |
|---|---|---|
| 2 | Tables, règles d'accès, tests d'isolement, menu « Agent IA » et ses onglets (les parties pas encore prêtes sont marquées « prévu ») | Non |
| 3 | Moteur IA, couche commune des fournisseurs, « Mes agents » avec les 6 modèles de départ, **testeur** | Non |
| 4 | Base de connaissances (fichiers, textes, liens, indexation, recherche) | Non |
| 5 | Connexion WhatsApp (Embedded Signup, webhook, envoi et réception) avec l'agence pilote | **Oui** |
| 6 | Boîte de réception, 3 modes, transfert à un conseiller | Oui |
| 7 | Actions CRM avec validation humaine | Non (mais testées sur WhatsApp) |
| 8 | Modèles Meta, statistiques, console, quotas et crédits | En partie |
| 9 | Audit final, tests de charge et de sécurité, mise en production | — |

Les phases 2 à 4 avancent **pendant** les démarches Meta.

## 10. Décisions attendues de l'utilisateur

1. Moteur SELECT plutôt que Meta Business Agent ?
2. Claude Haiku 5.5 par défaut, Sonnet 5.5 pour les cas complexes, et quel fournisseur de secours ?
3. Voyage pour les index de recherche ?
4. Répartition par formule (§ 7) et principe des crédits ?
5. Le rôle « lecture seule » ne voit pas le module : d'accord ?
6. SELECT est-elle une société immatriculée (vérification Meta), et quelle est l'offre Vercel ?

## Sources (consultées le 8 novembre 2026)
- Meta, tarifs : https://developers.facebook.com/docs/whatsapp/pricing
- Meta, Tech Provider : https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers
- Anthropic, tarifs : https://platform.claude.com/docs/en/about-claude/pricing
- Voyage, tarifs : https://docs.voyageai.com/docs/pricing
- Règle IA de Meta (sources secondaires) : https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- Tarifs Rest of Africa (source secondaire, à vérifier) : https://whautomate.com/whatsapp-business-api-pricing
- Coexistence (sources secondaires) : https://www.unifyport.ai/blog/whatsapp-embedded-signup-v4-coexistence-migration/
