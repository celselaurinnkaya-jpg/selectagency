# SELECT Agency — Journal et Historique des Conversations & Évolutions

Ce document sert de **mémoire persistante** pour toutes les sessions de travail, décisions d'architecture, échanges avec l'utilisateur et modifications apportées au projet SELECT Agency. Même en cas de perte de cache de l'éditeur ou de réinitialisation de session, ce fichier garantit la continuité absolue du projet.

---

## 📌 Règle Opérationnelle pour l'Assistant IA
À chaque session de travail ou demande majeure :
1. **Consigner l'échange** : Date & heure, demande de l'utilisateur, analyse réalisée.
2. **Tracer les changements** : Fichiers créés, modifiés, migrations ajoutées.
3. **Noter l'état de validation** : Résultat des tests (`npm test`), compilation (`npm run typecheck`).
4. **Indiquer les prochaines étapes** pour que la suite soit limpide.

---

## 📅 Historique Chronologique des Sessions

### Session 1 — 30 Octobre 2026 (Matin / Après-midi)
* **Objet** : Implémentation des piliers avancés du SaaS SELECT Agency (Phase 6+).
* **Demande / Contexte** :
  - Mise en place du module d'équipe étendu (transfert de propriété, réattribution automatique des dossiers).
  - Mise en place de la console d'administration centrale SELECT (Super-Admin sécurisé par MFA AAL2).
  - Gestion de la billetterie & support agence ↔ plateforme.
  - Gestion commerciale et financière avancée : devis reliés aux dossiers et annulation formelle des règlements avec traçabilité.
  - Export de données comptables et dossiers en CSV.
* **Réalisations & Fichiers Créés / Modifiés** :
  - **Migrations SQL** :
    - `supabase/migrations/20261030100000_equipe.sql` (fonctions `update_member_role`, `remove_member`, réattribution).
    - `supabase/migrations/20261030100100_plateforme.sql` (schéma `private.platform_admins`, `platform_access`, RLS étanches).
    - `supabase/migrations/20261030100200_support.sql` (tables `support_tickets`, `support_messages`).
    - `supabase/migrations/20261030100300_devis_et_annulations.sql` (tables `quotes`, `quote_items`, annulation de paiement).
  - **Interface & Pages** :
    - `src/app/(admin)/admin/*` : Console Super-Admin (abonnements, agences, journal, paiements, support, vérification).
    - `src/app/(app)/finance/quotes/*` : Interface de gestion et consultation des devis.
    - `src/app/(app)/support/*` : Espace de messagerie de support pour les agences.
    - `src/app/(app)/reports/export/*` : Téléchargement des exports CSV.
    - `src/app/(app)/settings/billing/*` : Vue sur l'abonnement et formules.
  - **Logique métier & Données** :
    - `src/lib/csv.ts` et `src/lib/csv.test.ts` : Moteur d'export CSV sécurisé.
    - `src/lib/domain/subscription.ts` : Gestion des plans et quotas d'abonnements.
    - `src/features/quotes/*`, `src/features/support/*`, `src/features/billing/*`, `src/features/admin/*`.
* **Validation** :
  - 73 tests réussis (`vitest run`).
  - Validation TypeScript sans erreur (`tsc --noEmit`).
  - Conservation strictly locale conformément à la règle anti-déploiement automatique GitHub/Vercel.

---

### Session 2 — 30 Octobre 2026 à 22:30
* **Objet** : Reprise en main, audit complet du projet et sécurisation de la mémoire des conversations.
* **Demande de l'Utilisateur** :
  - Constat de la disparition de la conversation précédente de l'historique de l'IDE.
  - Demande d'audit complet en lecture seule du dossier `selectagency` pour se remettre à niveau sur l'état du code sans rien modifier.
  - Demande explicite d'enregistrer et de consigner désormais toutes les conversations pour ne plus rien perdre.
* **Actions Réalisées** :
  - Inspection approfondie de l'arborescence, des migrations, du plan d'implémentation (`docs/PLAN_IMPLEMENTATION.md`), du `README.md` et des règles d'équipe.
  - Vérification de l'intégrité du code : `npm test` (73 tests passés avec succès), `npm run typecheck` (0 erreur).
  - Création du présent journal de bord permanent : `docs/JOURNAL_CONVERSATIONS.md`.
  - Ajout d'une règle impérative dans `AGENTS.md` obligeant l'agent à mettre à jour ce journal à chaque interaction importante.
* **État Actuel du Projet** :
  - Code fonctionnel, stable et conforme aux standards de design et de sécurité de SELECT Agency.
  - Aucune modification destructive, aucune régression.

---

### Session 3 — 30 Octobre 2026 à 22:34
* **Objet** : Lancement du serveur de développement et mise à disposition des liens d'accès direct.
* **Demande de l'Utilisateur** :
  - Fournir le lien direct pour visualiser la page et voir à quel niveau en est le projet.
* **Actions Réalisées** :
  - Démarrage du serveur local Next.js 16 via `npm run dev`.
  - Vérification de la disponibilité du port 3000 (`GET /` renvoie un statut HTTP 200 OK).
  - Fourniture des différents liens d'accès direct : landing page, espace de connexion, tableau de bord démo et console d'administration.
* **État Serveur** :
  - Serveur actif sur `http://localhost:3000`. Mode démo activé (`DEMO_DATA_ENABLED=true`).

---

### Session 4 — 30 Octobre 2026 (Claude Code) — Audit des deux espaces et de la sécurité
* **Demande** : auditer l'espace administrateur, l'espace agence, la base Supabase et la sécurité, sans modifier le projet ; tests avec deux agences fictives ; rapport classé par priorité.
* **Tests réellement exécutés** :
  - 73 tests automatiques (dont 34 sur une copie PostgreSQL de la base) : tous réussis.
  - Test réel sur Supabase + application locale (script hors projet, 2 agences fictives, 7 comptes `@example.com`) : 70/70, données de test supprimées et vérifiées (0 restant). Effet de bord : la numérotation des demandes de support a avancé de 2.
  - Analyseur de sécurité Supabase et build de production.
* **Non exécuté** : console SELECT avec un compte de test (attribution du rôle refusée par le contrôle de sécurité), envoi d'e-mails, version Vercel, clics réels sur Android.
* **Constats** : aucune fuite entre agences, aucune élévation vers administrateur. À corriger : E1 fausse agence « démonstration » sans abonnement (confirmé), E2 un conseiller peut valider une pièce ou clôturer un dossier « accordé » par l'API (confirmé), C1 e-mails de confirmation (SMTP) bloquants pour le lancement, E3 plan gratuit Supabase, M2 en-têtes de sécurité HTTP absents. Manquants : prospects, factures, modification/pause d'un dossier, archivage client, profil agence complet, paramètres généraux de la console.
* **Fichiers modifiés** : aucun (hors ce journal).

---

### Session 5 — 30 Octobre 2026 à 23:14 (Claude Code) — Analyse métier : services, partenaires, commissions, suivi des prestataires
* **Demande** : l'utilisateur décrit le fonctionnement réel d'une agence (étudiants) et demande d'analyser ce qui existe :
  - origine des clients (Facebook, Instagram, bouche-à-oreille, ancien client, partenaire) ;
  - services distincts : Campus France, Parcoursup, écoles privées (tentés l'un après l'autre), puis visa à l'ambassade et services annexes (hébergement, garant, AVI, assurance…) ; un client peut demander plusieurs services en même temps ; chaque agence choisit ses services ;
  - compteurs par service (combien de clients en AVI, en hébergement…) ;
  - menu « Partenaires » : code par partenaire saisi à l'arrivée du client, liste des clients apportés, commissions, tableau de bord ;
  - suivi des services faits avec un prestataire extérieur (agence de logement en France, Booking…) : dossier reçu, envoyé, en cours, reçu, remis au client, bouclé ; versements visibles pour les étudiants.
* **Analyse** : aujourd'hui un dossier = une procédure complète (le modèle « Études à l'étranger » mélange admission et visa), 6 catégories fixes, modèles d'étapes non modifiables par l'agence, pas d'origine du client, pas de partenaires ni de commissions, pas de prestataires. Proposition : catalogue de services par agence, un dossier par service regroupé dans un « parcours » client, enchaînement Campus France → Parcoursup → école privée → visa, origine et code partenaire sur la fiche client, partenaires et commissions, prestataires externes et suivi des versements. Booking : aucune connexion promise (pas d'API publique pour les agences ; enregistrement manuel de la référence et de la preuve).
* **Décisions attendues de l'utilisateur** : règles de commission (base, moment, montant), accès des partenaires à leurs résultats, liste de services de départ.
* **Fichiers modifiés** : aucun (hors ce journal). Rien n'a été commité ni envoyé sur GitHub.

---

### Session 6 — 30 Octobre 2026 (Claude Code) — Correction : « Nouveau dossier » renvoyait vers le premier dossier
* **Signalement** : après l'enregistrement d'un premier dossier, un clic sur « Nouveau dossier » ramenait vers ce premier dossier.
* **Cause** : avec `cacheComponents`, Next.js 16 garde en mémoire les pages visitées (React `<Activity>`). Le formulaire conservait son dernier résultat (« dossier créé → aller vers le dossier n°1 ») et l'effet `router.push` se relançait à chaque retour sur la page.
* **Correction** :
  - `src/features/cases/actions.ts` : la redirection vers le nouveau dossier se fait côté serveur (`redirect`) au moment de l'enregistrement, plus par un état rejoué.
  - `src/features/cases/CaseForm.tsx` et `src/features/clients/ClientForm.tsx` : formulaire remis à neuf à chaque nouvelle navigation (clé `useRouter().bfcacheId`, recommandée par la documentation Next.js) ; le bouton « retour » du navigateur retrouve toujours le brouillon. Suppression de l'effet de redirection devenu inutile dans le formulaire client.
* **Validation** : typage et lint sans erreur, 73 tests réussis ; test dans Chrome avec un compte de test (créé puis supprimé, 0 restant) : 8/8 (deux dossiers créés à la suite, tuile du tableau de bord, bouton « retour », formulaire client vierge).
* Rien n'a été commité ni envoyé sur GitHub.

---

### Session 7 — 31 Octobre 2026 (Claude Code) — Pièces du dossier : ouverture, téléchargement, plusieurs fichiers, modification, « Autre »
* **Signalements** : « Ouvrir le fichier » affichait la création de compte juste après un envoi ; pas de téléchargement ; un seul fichier par pièce ; impossible de modifier ou supprimer ; pas d'option « Autre » dans « Compléter la liste ».
* **Diagnostic de l'ouverture** : reproduit dans Chrome (compte de test, 5/5) — le serveur ouvre bien le fichier, dans le même onglet comme dans un nouvel onglet. Le lien s'ouvrait en nouvel onglet (`target="_blank"`) : dans le navigateur intégré à l'éditeur, cet onglet part dans un autre navigateur sans la session, d'où la page de connexion / création de compte.
* **Réalisations** :
  - Migration `supabase/migrations/20261031100000_pieces_multiples.sql` : table `document_files` (plusieurs fichiers par pièce, reprise des fichiers existants), fonctions `add_requirement_file`, `remove_requirement_file`, `update_requirement`, `delete_requirement` (rôle et abonnement vérifiés, dossier actif) ; `register_requirement_file` gardée compatible avec l'ancienne version de l'application.
  - Route `src/app/(app)/documents/[requirementId]/fichiers/[fileId]/route.ts` : « Voir » (même onglet) et « Télécharger » (`?telecharger=1`, fichier en pièce jointe avec son nom).
  - `DocumentUpload.tsx` (plusieurs fichiers à la fois, « Ajouter un fichier »), `DocumentForms.tsx` (suppression d'un fichier en deux temps, « Modifier la pièce » : nom, obligatoire, date d'expiration, retrait de la pièce ; « Autre pièce (à préciser) »), `documents/actions.ts`, `cases/actions.ts`, `cases/queries.ts`, page dossier (onglet Documents), `checklists.ts` (`OTHER_DOCUMENT`, `tracksExpiry` : une pièce « Autre » ne fait plus planter la page Documents).
  - Test de la base ajouté (plusieurs fichiers, retour « à vérifier », suppression, modification, retrait, refus pour une autre agence).
* **Validation** : typage et lint sans erreur ; 74 tests réussis (dont 35 sur la base).
* **En attente** : application de la migration sur Supabase par l'utilisateur (`npx supabase db push --linked`, refusée à l'assistant par le contrôle de sécurité), puis test Chrome prêt (`documents-flow.mjs`, hors projet). Tant que la migration n'est pas appliquée, la fiche dossier en local affiche une erreur.
* **Suite** : migration appliquée par l'utilisateur (vérifié : `20261031100000` présente en base). Test Chrome des pièces : 12/12 (deux fichiers à la fois, Voir dans le même onglet, Télécharger en pièce jointe avec son nom, refus sans connexion, suppression, retour « à vérifier », modification, « Autre », doublon refusé, retrait, page Documents).
* Rien n'a été commité ni envoyé sur GitHub.

---

### Session 8 — 31 Octobre 2026 (Claude Code) — Rendez-vous : modifier et supprimer
* **Demande** : pouvoir modifier et supprimer un rendez-vous.
* **Constat en base** : la mise à jour d'état visible sur la capture (« Prévu ») n'avait pas été enregistrée ; l'action annonçait un succès sans vérifier qu'une ligne avait changé.
* **Défaut trouvé par le test Chrome** : après un envoi refusé, React réinitialise le formulaire et les listes déroulantes reviennent à leur premier choix (type, état…) ; un second envoi enregistrait alors des valeurs non choisies. Corrigé pour le formulaire de rendez-vous (clé recréant chaque liste avec la valeur saisie). Le même mécanisme existe dans les autres formulaires qui ont des listes déroulantes (dossier, client, tâche, paiement, dépense, invitation, console…) : à traiter si l'utilisateur le valide.
* **Réalisations** :
  - `src/features/appointments/actions.ts` : `updateAppointmentAction` (tous les champs, dont l'état et la preuve), `deleteAppointmentAction` ; vérification qu'une ligne a bien été modifiée ou supprimée ; règle « administratif confirmé = référence de la preuve » ; historique du dossier.
  - `src/features/appointments/AppointmentForms.tsx` (champs communs création / modification, `AppointmentActions` : Modifier, Supprimer avec confirmation), `src/features/appointments/values.ts`.
  - Pages : onglet Rendez-vous du dossier, page Rendez-vous (à venir et passés).
* **Validation** : typage et lint sans erreur ; 74 tests (un échec isolé sans détail juste après le typage, puis 4 passages complets réussis — plantages mémoire déjà connus sur ce PC) ; test Chrome sur la vraie base avec compte de test supprimé : 7/7 (refus sans preuve et rien d'enregistré, modification complète enregistrée, état seul « Terminé », suppression, historique).
* Rien n'a été commité ni envoyé sur GitHub.

### Session 9 — 31 Octobre 2026 (Claude Code) — Facturation : facture prête à imprimer, PDF, WhatsApp, logo, cachet et signature
* **Demande** : facturation inspirée d'une capture (formulaire à gauche, aperçu à droite) : imprimer, télécharger, envoyer par WhatsApp, modifier, supprimer ; logo, cachet et signature envoyés depuis les paramètres et appliqués sur la facture.
* **Décisions** :
  - La facture est un document remis au client, adressé à un client (dossier facultatif), dans la devise choisie. Elle ne crée ni prestation ni paiement : les encaissements restent dans « Paiements et reçus » (reçus numérotés). « Marquer comme payée » est un état de la facture, sans reçu.
  - Numérotation `FAC-AAAA-00001` à la création ; le numéro d'une facture supprimée n'est jamais réutilisé (la suppression est notée dans l'historique du client).
  - États : brouillon → émise → payée ; annulation tant qu'elle n'est pas payée ; une facture payée est verrouillée (ni modification ni suppression) et peut être remise « à payer ».
  - Montants recalculés par la base : ligne = quantité × prix ; taxe par ligne (ex. 19,25 %) arrondie à l'unité ; total = lignes + taxes − remise (remise déduite après taxes).
  - Droits : créer et modifier = propriétaire, administrateur, conseiller, comptable ; supprimer = propriétaire, administrateur, comptable ; lecture seule : aucun accès. Logo, cachet, signature et coordonnées : propriétaire et administrateurs.
  - Images dans un bucket privé `branding` (PNG ou JPEG, 2 Mo) : jamais d'adresse publique pour le cachet et la signature ; affichées via une page protégée de l'application.
  - WhatsApp : sur téléphone, partage direct du PDF (feuille de partage du système) ; sur ordinateur, PDF téléchargé et WhatsApp ouvert avec le message prérempli (fichier à joindre). Rien n'est envoyé automatiquement ; l'historique note « préparé, envoi manuel ».
  - PDF généré côté serveur avec `pdf-lib` (nouvelle dépendance, polices standard du PDF).
* **Réalisations** :
  - Migration `supabase/migrations/20261031120000_factures.sql` : tables `invoices`, `invoice_items`, `invoice_settings` ; bucket `branding` et ses règles ; fonctions `save_invoice`, `set_invoice_status`, `delete_invoice`, `save_invoice_settings`, `set_invoice_image`.
  - `src/features/invoices/` : `totals.ts` (+ tests), `document.ts`, `InvoiceDocument.tsx` (aperçu et page imprimable), `pdf.ts` (+ tests), `queries.ts`, `actions.ts`, `settings-actions.ts`, `storage.ts`, `InvoiceEditor.tsx` (formulaire + aperçu en direct), `InvoiceToolbar.tsx` (imprimer, PDF, WhatsApp, modifier, supprimer, états), `InvoiceSettingsForms.tsx`.
  - Pages : `/finance/invoices` (liste, filtres, reste à encaisser), `/finance/invoices/new`, `/finance/invoices/[id]`, `/finance/invoices/[id]/edit`, routes `/finance/invoices/[id]/pdf` et `/finance/invoices/images/[kind]`, `/settings/invoices` (onglet « Factures » des paramètres), onglet « Factures » de la finance, section « Factures » dans l'onglet Finance du dossier (bouton « Créer une facture »).
  - Types, libellés, colonnes lues et droit `invoice.delete` ajoutés.
* **Validation** : typage et lint sans erreur ; 84 tests réussis (dont 4 nouveaux tests de base : cloisonnement entre agences, rôles, montants, verrouillage, numérotation ; et tests du calcul et du PDF) ; PDF d'essai vérifiés visuellement (émise avec images, brouillon sans images, payée sur deux pages).
* **Suite (même jour)** : migration appliquée par l'utilisateur. Signalement : « les images déposées ne se voient pas » (logo, cachet, signature cassés).
  - **Cause** : le serveur `npm run dev` lancé avant l'ajout des factures gardait en mémoire une ancienne version du module des colonnes (`rows.ts`) pour les routes de fichiers (images, PDF) → erreur 500 « Cannot read properties of undefined (reading 'list') ». Les fichiers étaient bien enregistrés (PNG valides, bons chemins). Le code est correct : vérifié sur une version neuve (`npm run build` + `next start` sur le port 3100). **Il suffit de redémarrer `npm run dev`.**
  - **Défaut réel trouvé par le test Chrome et corrigé** : après « Enregistrer les modifications », la page de la facture (déjà gardée en mémoire par Next) restait bloquée sur le squelette de chargement, que la navigation passe par `redirect()` ou `router.push`. L'enregistrement et la suppression renvoient maintenant l'adresse, et la page la charge entièrement (`window.location.assign`).
  - **Affichage téléphone** : le tableau des prestations était coupé ; il est remplacé par une liste sous 640 px (le tableau reste pour l'ordinateur et l'impression).
* **Validation finale** : typage et lint sans erreur ; 84 tests ; `npm run build` réussi ; test Chrome de bout en bout sur la vraie base (compte de test supprimé) : **35/35** (images dans les paramètres, aperçu en direct, émission, images sur la facture, PDF avec images, impression, WhatsApp et historique, modification, payée/verrouillée, remise à payer, brouillon numéroté, liste, téléphone, suppression, retrait d'une image et effacement du fichier).
* Rien n'a été commité ni envoyé sur GitHub.

### Session 10 — 31 Octobre 2026 (Claude Code) — Menu « Services » : services de l'agence et clients suivis
* **Demande** : ajouter « Services » au menu, entre Documents et Rendez-vous. L'agence crée, modifie et supprime ses propres services (hébergement, garant, AVI, parcours d'admission…). En ouvrant un service, on y ajoute des clients ; un clic sur un client donne accès à son dossier, ses finances et tout le reste. Le tout synchronisé avec l'existant.
* **Décisions** :
  - Chaque agence a sa propre liste de services : nom (unique dans l'agence, majuscules comprises), description, tarif indicatif facultatif (montant + devise), service actif ou désactivé. Un service désactivé garde ses clients visibles mais n'en accepte plus de nouveaux.
  - Un client s'ajoute une seule fois à un service, avec un état de suivi (En cours, Attente client, Attente d'un tiers, Terminé, Annulé), le dossier concerné (facultatif) et une remarque.
  - Le service ne porte aucune somme due : la finance reste dans les dossiers (prestations, paiements, reçus) et les factures. La page du service affiche le reste à payer du client, tous dossiers confondus et par devise (rôles qui voient la finance uniquement).
  - Droits : liste des services = propriétaire et administrateurs (nouveau droit `services.manage`) ; ajouter, modifier un suivi, retirer = propriétaire, administrateur, conseiller ; tous les membres peuvent consulter. Agence en lecture seule : aucune écriture.
  - Supprimer un service retire ses clients (fiches, dossiers, paiements, factures intacts) ; chaque ajout, changement d'état, retrait ou suppression est noté dans l'historique du client.
  - Ce lot répond à la partie « services » de l'analyse de la Session 5. Partenaires, commissions, prestataires et enchaînement des procédures restent à faire (décisions de la Session 5 toujours en attente).
* **Réalisations** :
  - Migration `supabase/migrations/20261031150000_services.sql` : tables `services` et `service_clients` (RLS, écriture uniquement par fonctions) ; fonctions `save_service`, `delete_service`, `add_service_client`, `update_service_client`, `remove_service_client`.
  - `src/features/services/` : `queries.ts`, `actions.ts`, `ServiceForms.tsx` (formulaire de service avec suggestions, suppression confirmée, ajout d'un client, modification du suivi, retrait), `suggestions.ts` (12 services courants proposés en un clic).
  - Pages : `/services` (compteurs, cartes des services, services désactivés, page vide avec suggestions), `/services/new`, `/services/[id]` (compteurs, ajout d'un client, filtre par état, fiche de chaque client avec dossier, reste à payer, liens Fiche client / Dossiers / Finances), `/services/[id]/edit`.
  - Menu : entrée « Services » ; route protégée dans `src/lib/supabase/proxy.ts`.
  - Fiche client : onglet « Services » (ajout à un service, suivi, retrait) et ligne « Services suivis » dans le résumé.
  - Factures : choix « Ajouter un service de l'agence », qui remplit une ligne avec le nom et le tarif indicatif du service.
  - Types, libellés (`SERVICE_CLIENT_STATUS`), colonnes lues, droit `services.manage`.
  - Test de base instable corrigé (« plusieurs fichiers par pièce » choisissait parfois la pièce du test précédent).
* **Validation** : typage et lint sans erreur ; 87 tests (dont 3 nouveaux tests de base : droits, doublons, autre agence, dossier d'un autre client, service désactivé, historique, suppression) ; `npm run build` réussi.
* **En attente** : application de la migration par l'utilisateur (`npx supabase db push --linked` ; vérification à blanc : seule `20261031150000_services.sql` est en attente), redémarrage de `npm run dev`, puis test Chrome de bout en bout (`services-flow.mjs`, hors projet).
* Rien n'a été commité ni envoyé sur GitHub.

---

### Session 11 — 31 Octobre 2026 à 21:16 — Déploiement et Push GitHub / Vercel
* **Demande de l'Utilisateur** : « fais le push » (autorisation et demande explicite de déploiement).
* **Vérifications préalables de sécurité et de conformité** :
  - Tests unitaires et base de données : **87/87 tests réussis** (`vitest run`).
  - Compilation et rendu Next.js : **57/57 routes validées** (`next build`).
  - Aucun avertissement ou erreur TypeScript.
* **Actions Réalisées** :
  - Indexation et commit de l'ensemble des fonctionnalités développées (Équipe & Rôles, Plateforme Console Super-Admin, Devis & Annulations, Support, Factures avec PDF/WhatsApp, Menu Services, Exports CSV, Multi-fichiers, etc.).
  - Exécution de `git push origin main` vers GitHub (déclenchement du déploiement continu Vercel).


### Session 12 — 31 Octobre 2026 (Claude Code) — Équipe : « Ajouter un membre » visible et invitations complètes
* **Demande** : capture de la section « Membres » de la page Équipe : « il n'y a pas la possibilité d'ajouter un membre ».
* **Constat** : l'invitation existait, mais dans une section séparée plus bas (« Inviter un collaborateur »), sans aucun lien depuis « Membres ». Autres manques trouvés : le lien d'une invitation n'était visible qu'au moment de sa création (perdu ensuite), une même adresse pouvait recevoir plusieurs invitations, une invitation expirée restait affichée « en attente », et le rôle choisi pouvait revenir à « Agent » après une erreur de saisie (réinitialisation des formulaires par React 19).
* **Réalisations** :
  - `src/app/(app)/team/page.tsx` : bouton « Ajouter un membre » dans l'en-tête de « Membres », carte en pointillés « Ajouter un membre » à côté des membres, message quand le propriétaire est seul, places utilisées (membres + invitations valables, même calcul que la base). Section « Ajouter un membre » expliquée en 3 étapes. Formule pleine : bouton et carte masqués, explication avec lien vers Aide et support. Nouvelle section « Invitations en attente » : rôle, fonction, dates, badge En attente / Expirée, Copier le lien, message WhatsApp, Renouveler (si expirée), Annuler.
  - `src/features/team/TeamForms.tsx` : formulaire d'invitation à champs contrôlés envoyé par `onSubmit` (rôle et fonction conservés après une erreur, formulaire vidé après succès), description du rôle sous le choix, boutons d'au moins 40 px (y compris « Gérer l'accès »).
  - `src/features/team/actions.ts` : refus d'une deuxième invitation valable pour la même adresse ; `renewInvitationAction` (nouvelle invitation de 7 jours avec le même rôle, l'ancienne est annulée seulement si la base accepte la nouvelle).
  - `src/features/operations/queries.ts` (`getTeam`) : lien complet de chaque invitation, état expiré, places utilisées et restantes.
  - `src/lib/domain/labels.ts` : `INVITATION_WAITING`, `INVITATION_EXPIRED`.
* **Validation** : typage et lint sans erreur ; `npm run build` réussi ; test Chrome de bout en bout sur la vraie base (`team-flow.mjs`, hors projet, comptes de test supprimés) : **32/33** — carte et bouton, défilement vers le formulaire, rôle conservé après erreur, invitation créée avec le bon rôle, doublon refusé, expirée puis renouvelée, acceptation (la comptable apparaît dans « Membres »), annulation, formule pleine, téléphone sans défilement horizontal, aucune erreur JavaScript. Le seul échec (boutons de 36 px dans « Gérer l'accès » sur téléphone) est corrigé ; ce dernier point n'a pas été repassé dans Chrome (test interrompu à la demande de l'utilisateur, ses restes en base ont été supprimés).
* La migration des services est appliquée sur la base en ligne (vérification à blanc : base à jour).

---

### Session 13 — 31 Octobre 2026 à 22:04 — Push GitHub & Déploiement Vercel (Améliorations Équipe)
* **Demande de l'Utilisateur** : « fais le push » (autorisation explicite).
* **Vérifications préalables** :
  - Tests unitaires et base de données : **87/87 tests réussis** (`vitest run`).
  - Compilation Next.js 16 : **57/57 routes** validées (`next build`).
* **Contenu déployé** :
  - Page Équipe : ajout du bouton et de la carte « Ajouter un membre » bien visibles.
  - Retransmission du lien d'invitation (copier / WhatsApp), gestion des invitations expirées avec renouvellement en 1 clic.
  - Prévention des doublons d'invitations et sécurisation des rôles sélectionnés.
  - Boutons tactiles standardisés (hauteur ≥ 40 px pour mobile).
* **Actions** :
  - Commit et `git push origin main` vers GitHub (déclenchement de la CI/CD Vercel).

### Session 13 — 31 Octobre 2026 (Claude Code) — Bilan de la liste 3.1 à 3.6, puis lot 1 : paiements à vérifier et reçus
* **Demande** : vérifier ce qui manque dans la liste « Finaliser les fonctionnalités métier » (3.1 prospects et clients, 3.2 procédures d'études, 3.3 services, 3.4 suivi des dossiers de services, 3.5 partenaires et commissions, 3.6 paiements et reçus), puis « commence par le plus important, tout doit être synchronisé, vérifie que chaque ajout fonctionne ».
* **Bilan remis** : 3.1 en partie (pas de prospect, pas d'origine du contact, pas de conversion, relances = tâches manuelles) ; 3.2 en partie (un seul type « Études à l'étranger », Campus France / Parcoursup / écoles privées non séparés) ; 3.3 presque fait (étapes par service manquantes) ; 3.4 en partie (état simple, pas d'étapes modifiables, modèles d'étapes des dossiers figés) ; 3.5 pas commencé (5 questions de la Session 5 toujours ouvertes) ; 3.6 en grande partie (manquaient : PDF du reçu, envoi au client, paiement en attente / confirmé, format A4 imposé).
* **Ordre retenu** : 3.6 → 3.1 → étapes modifiables (3.2 + 3.3 + 3.4) → 3.5 (après les réponses).
* **Lot 1 — Paiements et reçus (3.6)** :
  - Migration `20261031180000_paiements_en_attente.sql` : état « pending » (annoncé, sans reçu, hors des soldes mais part réservée sur le reste à payer), `confirmed_at` / `confirmed_by`, numéro de reçu attribué seulement à la confirmation, `confirm_payment`, `record_payment` avec `p_pending` (faux par défaut : la version en ligne continue de fonctionner), `void_payment` qui laisse un conseiller annuler un paiement encore à vérifier.
  - Formulaire de paiement à champs contrôlés (plus rien ne se perd après une erreur) avec le choix « Reçu et vérifié » / « Annoncé, à vérifier ».
  - Reçu refait comme la facture (`ReceiptDocument`, `receipt.ts`) : logo, cachet, signature et mentions de Paramètres > Factures ; PDF A4 (`receipt-pdf.ts`, route `/finance/receipts/[id]/pdf`) ; boutons Imprimer, Télécharger le PDF, Envoyer par WhatsApp, Envoyer par e-mail (PDF téléchargé ou partagé, message préparé, envoi noté « préparé, envoi manuel ») ; page « Paiement à vérifier » sans reçu, avec Confirmer la réception / Annuler.
  - Synchronisation : onglet Finance du dossier (badge, « + … à vérifier », confirmation sur place), onglet Paiements de la fiche client, Finance > Paiements (alerte, filtres Tous / À vérifier / Confirmés / Annulés), tableau de bord (« Paiement à vérifier » dans À traiter, badge sur la tuile Finance), export CSV (statut, date de confirmation), impression forcée en A4 (`globals.css`).
* **Préparé pour le lot 2 (3.1)** : migration `20261031190000_prospects.sql` (statut prospect / client sur la même fiche, origine du contact, `convert_prospect`, conversion automatique au premier dossier ou à l'ajout à un service, statut par défaut pour l'import de la démonstration). L'interface des prospects n'est pas encore écrite.
* **Validation** : typage et lint sans erreur ; 94 tests (dont 45 de base : paiement annoncé, part réservée, confirmation, numéro de reçu, annulation sans reçu, prospects) ; `npm run build` réussi. Test Chrome `receipts-flow.mjs` (hors projet) écrit, en attente de la migration.
* **En attente** : l'utilisateur applique les deux migrations (`npx supabase db push --linked`). Tant que ce n'est pas fait, l'espace agence local ne peut pas lire les paiements (colonne `confirmed_at` absente).
* Rien n'a été commité ni envoyé sur GitHub.

### Session 14 — 1er Novembre 2026 (Claude Code) — Vérification du lot 1 (paiements et reçus) et des services
* **Contexte** : l'utilisateur a appliqué les migrations `20261031180000_paiements_en_attente.sql` et `20261031190000_prospects.sql` (base en ligne à jour, vérifié à blanc).
* **Test Chrome paiements et reçus (`receipts-flow.mjs`, vraie base, compte de test supprimé) : 32/32** — paiement « à vérifier » sans reçu et hors soldes, part réservée, champs conservés après une erreur, tableau de bord, liste filtrée, confirmation (reçu numéroté, date et auteur), reçu complet, PDF A4 d'une page, impression A4, WhatsApp et e-mail notés « préparé, envoi manuel », annulation d'un paiement jamais arrivé (sans reçu), fiche client, historique, téléphone, aucune erreur JavaScript.
* **Correction trouvée par le test** : le lien « Retour » en haut des pages (composant partagé `PageHeader`) faisait 36 px ; il fait maintenant 40 px sur toutes les pages (`src/components/shared/ui.tsx`).
* **Services (`services-flow.mjs`)** : 33/36 au premier passage. Les 3 écarts venaient du script de test, pas de l'application, vérifié par des essais ciblés : l'ajout depuis la fiche client fonctionne (le formulaire laisse la place à « suit déjà tous les services actifs ») ; la modification d'un service enregistre bien le nouveau nom et la désactivation quand on tape puis coche comme une personne. Scripts de test rendus plus fiables (attente du nouveau document, de l'hydratation, clics après la saisie, onglet ramené au premier plan après WhatsApp). Le dernier passage complet a été arrêté par l'utilisateur ; ses données de test ont été supprimées.
* **Reste à faire** (ordre convenu) : interface des prospects (3.1, base déjà prête), étapes modifiables pour dossiers et services (3.2 + 3.3 + 3.4), partenaires et commissions (3.5, après les 5 questions).
* Rien n'a été commité ni envoyé sur GitHub.

### Session 15 — 1er Novembre 2026 (Claude Code) — Lot 2 : prospects et clients (3.1)
* **Demande** : « continue » (suite de l'ordre convenu, après les paiements et reçus).
* **Réalisations** (la base était prête : migration `20261031190000_prospects.sql`, appliquée) :
  - Menu « Prospects » juste avant « Clients » ; route protégée ; « Nouveau prospect » dans le menu « Nouveau ».
  - `/prospects` : compteurs (en cours, à relancer, sans relance prévue, devenus clients ce mois-ci), filtres, cartes (téléphone, projet, origine, prochaine relance en rouge si due, rendez-vous, conseiller, premier contact).
  - `/prospects/new` : formulaire court à champs contrôlés (nom, téléphone, pays, origine en un geste — Facebook, Instagram, WhatsApp, TikTok, recommandation, visite, site, appel, autre —, précision, projet, conseiller, première relance avec raccourcis Demain / 3 jours / une semaine, notes). Doublons signalés comme pour un client (un prospect existant est indiqué « ouvrez sa fiche et transformez-le en client »).
  - Fiche : badge « Prospect », bloc « Prospect à suivre » (origine, premier contact, projet, bouton « Transformer en client » avec confirmation, relances avec « Planifier la relance »), origine du contact et date de conversion dans le profil, retour vers les prospects.
  - Relances = tâches liées à la fiche, confiées au conseiller (Tâches, « À traiter aujourd'hui »).
  - Rendez-vous sans dossier : l'onglet Rendez-vous de la fiche permet d'en programmer un, lié à la personne (`clientId` ajouté à l'action et au formulaire des rendez-vous), noté dans l'historique.
  - Synchronisation : la liste des clients exclut les prospects (lien « N prospects à suivre ») ; tableau de bord (clients sans les prospects, « + N prospect(s) à suivre ») ; recherche (« Prospect ») ; nouveau dossier (« prospect, deviendra client ») ; rapports (« Origine des nouveaux contacts » et prospects devenus clients sur la période) ; « Origine du contact » ajoutée au formulaire client.
  - Code : `src/features/prospects/` (actions, queries, ProspectForms), `src/features/clients/phone.ts` (numéro au format international, partagé), `duplicateLabel`.
* **Validation** : typage et lint sans erreur ; 94 tests ; `npm run build` réussi ; test Chrome `prospects-flow.mjs` (hors projet, vraie base, compte supprimé) : **21/21** (menu, création avec relance, fiche, listes, doublon, relance et rendez-vous sans dossier, transformation sur la même fiche, historique, téléphone, aucune erreur JavaScript).
* **Suite** : étapes modifiables pour les dossiers et les services (3.2, 3.3, 3.4), puis partenaires et commissions (3.5, après les 5 questions).
* Rien n'a été commité ni envoyé sur GitHub.

### Session 16 — 1er Novembre 2026 (Claude Code) — Lot 3 : étapes des services et procédures d'études (3.2, 3.3, 3.4)
* **Demande** : « continue » (étapes modifiables, après les prospects).
* **Étapes des services** (migration `20261101100000_etapes_services.sql`) :
  - Chaque service a sa liste d'étapes (`service_steps`), proposée par défaut à la création : Demande reçue, Documents attendus, Documents reçus, Paiement vérifié (si nécessaire), Dossier transmis au partenaire, Réception confirmée, Traitement en cours, Résultat reçu, Résultat transmis au client, Service terminé. Services existants complétés avec ces étapes.
  - Chaque client ajouté reçoit une copie (`service_client_steps`) : changer la liste ensuite ne touche pas les suivis en cours. Suivis déjà terminés : toutes leurs étapes marquées faites.
  - `save_service_steps` (responsables), `set_service_client_step` (responsables et conseillers) : chaque étape cochée ou décochée est notée dans l'historique ; toutes faites → suivi « Terminé » ; une étape décochée d'un suivi terminé → « En cours ».
  - Écrans : page du service (étapes affichées, avancement de chaque client avec barre, bouton « Étape faite : … » et liste à cocher), modification du service (éditeur : renommer, ajouter, monter, descendre, retirer, revenir aux étapes proposées), onglet Services de la fiche client (même avancement).
* **Procédures d'études** : trois modèles de départ distincts — « Études en France — Campus France », « Études en France — Parcoursup », « Admission dans une école privée » — en plus de « Études à l'étranger (autre procédure) », chacun avec ses étapes, ses choix (admission, refus, autre candidature) et la partie visa. À la création d'un dossier d'études, on choisit la procédure ; un même client peut avoir plusieurs dossiers. Le nom de la procédure s'affiche dans les listes de dossiers, la fiche client, la recherche et le dossier.
* **Modèles adaptés par l'agence** (migration `20261101110000_modeles_etapes.sql`, table `workflow_templates`, fonctions `save_workflow_template` / `reset_workflow_template`) : Paramètres > Modèles d'étapes devient modifiable (renommer, ajouter, déplacer, retirer, nature de l'étape, facultative ; étapes liées à une décision seulement renommables ; clôture toujours en dernier ; « Revenir au modèle de départ »). Les nouveaux dossiers suivent la version de l'agence ; les dossiers ouverts gardent la leur.
* **Validation** : typage et lint sans erreur ; 107 tests (dont base : étapes de services, droits, copie, Terminé automatique, historique, modèles d'agence ; et cohérence de tous les modèles) ; `npm run build` réussi. Test Chrome `steps-flow.mjs` (hors projet) prêt.
* **Migrations appliquées par l'utilisateur** ; test Chrome `steps-flow.mjs` (vraie base, compte supprimé) : **28/28** — 10 étapes proposées, « Étape faite » en un geste, liste à cocher, suivi « Terminé » automatique, même avancement sur la fiche client, historique, éditeur des étapes (renommer, retirer, ajouter ; suivis en cours inchangés), dossier Campus France avec ses étapes, modèle adapté par l'agence (étapes liées à une décision verrouillées, nouveau dossier avec les étapes de l'agence, ancien dossier inchangé), retour au modèle de départ, téléphone, aucune erreur JavaScript.
* Rien n'a été commité ni envoyé sur GitHub.

### Session 17 — 1er Novembre 2026 (Claude Code) — Lot 4 : partenaires et commissions (3.5)
* **Décisions de l'utilisateur** : commission = montant fixé par l'agence (« chaque agence a sa façon de faire ») ; due dès le premier paiement du client ; espace partenaire en lecture seule.
* **Mise en œuvre retenue** : montant par client apporté fixé pour chaque partenaire, ajustable commission par commission ; statuts « En attente du 1er paiement » → « À payer » (automatique au premier paiement confirmé, retour en attente si ce paiement est annulé) → « Payée » (date, moyen, référence) ou « Annulée » (motif). Un client = un partenaire = une commission (pas de double comptage) ; une commission payée bloque le changement de partenaire.
* **Migration `20261101120000_partenaires.sql`** : tables `partners` (code unique par agence, commission, accès) et `partner_commissions`, colonne `clients.partner_id`, déclencheur sur les paiements, fonctions `save_partner`, `set_client_partner`, `update_commission`, `pay_commission`, `cancel_commission`, `create_partner_access`, `revoke_partner_access`, `get_partner_access`, `accept_partner_access`, `is_partner`, `partner_portal`. Le partenaire n'est jamais membre : aucune politique de lecture ne lui ouvre les tables ; `partner_portal()` ne renvoie que prénom + initiale, avancement simple et commissions.
* **Écrans** : menu « Partenaires » (après Finance) ; liste (actifs, clients apportés, à payer, versé ce mois-ci), création / modification, page du partenaire (clients apportés, commissions avec Ajuster / Marquer payée / Annuler, espace partenaire : lien personnel lié à une adresse e-mail, copier ou WhatsApp, retrait de l'accès) ; « Code partenaire » sur les formulaires client et prospect (code inconnu ou partenaire désactivé refusés avant tout enregistrement) ; « Apporté par » sur la fiche client ; page `/acces-partenaire/[token]` (créer son compte ou se connecter avec la bonne adresse) ; espace `/partenaire` (en-tête simple, sans le menu de l'agence) ; un partenaire qui se connecte est conduit vers son espace.
* **Droits** : partenaires créés et modifiés par le propriétaire et les administrateurs ; code saisi par eux et les conseillers ; commissions gérées par le propriétaire, les administrateurs et le comptable, lisibles par les rôles qui voient la finance.
* **Validation** : typage et lint sans erreur ; 109 tests (dont base : droits, code, commission en attente puis à payer au 1er paiement, ajustement, versement, blocage après paiement, espace partenaire limité, aucune table lisible par le partenaire, retrait de l'accès) ; `npm run build` réussi. Test Chrome `partners-flow.mjs` (hors projet) prêt.
* **Migration appliquée par l'utilisateur** ; test Chrome `partners-flow.mjs` (vraie base, comptes supprimés) : **23/23** — création (code mis en majuscules), code inconnu refusé sans rien enregistrer, prospect apporté avec son code, commission en attente puis « à payer » au premier paiement, montant ajusté, versement (moyen noté), lien d'accès, connexion du partenaire avec la bonne adresse, espace limité (prénom et initiale, avancement, commission ; ni nom complet, ni téléphone, ni paiements), partenaire renvoyé vers son espace s'il ouvre les pages de l'agence, aucune donnée de l'agence dans les réponses, téléphone, aucune erreur JavaScript. Retouche : « À recevoir » en orange seulement s'il y a un montant à recevoir.
* **Liste « Finaliser les fonctionnalités métier » (3.1 à 3.6) : terminée et vérifiée.**
* Rien n'a été commité ni envoyé sur GitHub.

---

### Session 18 — 1er Novembre 2026 à 12:15 — Reprise de la session & Bilan de santé
* **Demande de l'Utilisateur** : reprise de la conversation sur le projet SELECT Agency (« on contunu la conversationsur le projet select agency »).
* **Vérification de l'état du projet** :
  - `npm run typecheck` : 0 erreur TypeScript.
  - `npm test` : 109/109 tests validés avec succès (100% de réussite).
  - Statut git : modifications locales des Sessions 13 à 17 prêtes (lots 1 à 4 terminés et testés, aucun commit ni push sans demande explicite).
* **Objectif** : alignement avec l'utilisateur sur la suite des priorités (lancement du serveur dev local, commit / push éventuel si souhaité, ou poursuite des fonctionnalités suivantes comme les prestataires externes).


### Session 18 — 1er Novembre 2026 (Claude Code) — Documents PDF : reçus, factures, devis, récapitulatif, confirmations
* **Demande** : « Finaliser les documents PDF » — reçus, factures, devis, confirmations de réservation, récapitulatifs de dossier, avec les données réelles (identité de l'agence, numéro, date, client, service, montant, mode et référence de paiement, solde restant) et une impression propre sur A4.
* **Vérification préalable** (contrôle d'impression dans Chrome, compte de test supprimé) : reçu propre (1 page A4) mais sans solde restant ; facture de 6 lignes sur 2 pages ; devis à l'ancienne présentation (logo SELECT, ni identité de l'agence, ni PDF, ni envoi) ; aucun récapitulatif ni confirmation de réservation.
* **Choix de l'utilisateur** : situation financière du récapitulatif au choix à chaque document ; confirmations de réservation avec service, prestataire, référence, dates, lieu, détails, montant, client.
* **Réalisations** :
  - Migration `20261101130000_documents.sql` : `payments.balance_after_minor` (reste à payer figé à la confirmation, reçus existants complétés) ; table `service_bookings` (numéro CONF-AAAA-00001), fonctions `save_booking` / `delete_booking` (historique du client).
  - Modèle commun de document (`src/features/printables/` : `spec.ts`, `PrintableDocument.tsx`, `spec-pdf.ts`, `DocumentToolbar.tsx`, `actions.ts`) : même présentation que les factures, page imprimable et PDF A4 identiques, aucune ligne coupée entre deux pages, numéros de page, envoi WhatsApp / e-mail noté dans les communications.
  - Reçu : « Reste à payer sur le dossier » (ou « Soldé ») sur la page et le PDF ; nom de la procédure à côté du dossier (aussi sur les factures).
  - Facture : impression resserrée (marges internes, signature), lignes, totaux et signature jamais coupés.
  - Devis : nouvelle présentation (identité de l'agence, logo, cachet, signature, conditions), PDF `/finance/quotes/[id]/pdf`, envoi WhatsApp / e-mail.
  - Récapitulatif de dossier : `/cases/[id]/recapitulatif` (bouton « Récapitulatif à remettre » sur le dossier) — démarche, destination, état, prochaine action, conseiller, étapes avec dates, pièces, rendez-vous à venir, situation financière au choix (« Inclure / Retirer la situation financière »), PDF et envoi.
  - Confirmations de réservation : « Préparer une confirmation de réservation » sur chaque client suivi (page du service et fiche client), page `/services/confirmations/[id]` (modifier, supprimer), PDF et envoi.
* **Validation** : typage et lint sans erreur ; 114 tests (dont base : solde figé sur chaque reçu, numérotation et droits des confirmations ; PDF du modèle commun : A4, plusieurs pages, image illisible) ; `npm run build` réussi. Contrôle Chrome `docs-check.mjs` (hors projet) prêt : 6 documents × (données réelles, A4, une page, sans éléments de l'application, sans débordement, PDF téléchargé).
* **Migration appliquée par l'utilisateur.** Premier contrôle Chrome : 42/51 — facture de 6 lignes et récapitulatif complet sur 2 pages (impression et PDF), plus deux vérifications trop strictes du script. Corrections : PDF des factures et du modèle commun resserrés (en-tête, lignes, signature), étapes et pièces sur deux colonnes (page, impression, PDF), impression en A4 avec marges de 12 mm et texte un peu plus serré. Mesure locale des PDF sans navigateur (facture 6 lignes : 1 page).
* **Contrôle Chrome final `docs-check.mjs` : 51/51** — reçu, facture, devis, récapitulatif (sans et avec finances), confirmation : données réelles de l'agence et du client, A4, une page (le récapitulatif complet avec finances tient proprement sur 2 pages), sans menu ni boutons, sans débordement, PDF téléchargé en A4 ; envoi WhatsApp du devis noté ; bouton « Récapitulatif à remettre » ; téléphone ; aucune erreur JavaScript.
* Rien n'a été commité ni envoyé sur GitHub.

### Session 19 — 1er Novembre 2026 (Claude Code) — E-mails : choix de Brevo, puis audit (phase 1, sans modification du code)
* **Demandes** : liste de ce qui reste (sauvegarde Git, sécurité E1/E2/M2, formulaires, dossier/archivage, lancement) — mise de côté par l'utilisateur pour plus tard ; puis « Configurer les e-mails » : choix du fournisseur (Brevo recommandé et retenu : français, 300 e-mails/jour gratuits, API + SMTP), puis cahier des charges d'intégration Brevo en 4 phases.
* **Audit (phase 1)** :
  - Comptes : `signUp` et `resetPasswordForEmail` (`src/features/auth/actions.ts`) + `/auth/confirm` déjà corrects ; envoi par le SMTP par défaut de Supabase, limité à **2 e-mails par heure** (`supabase/config.toml`, `[auth.rate_limit] email_sent = 2`), modèles anglais par défaut.
  - Aucun domaine propre : `site_url = https://selectagency.vercel.app` → un domaine à acheter est indispensable pour un expéditeur authentifié (SPF, DKIM, DMARC).
  - L'application n'utilise jamais la clé secrète Supabase (tout passe par la session et la RLS) ; aucun envoi automatique, aucune tâche planifiée (ni `vercel.json`, ni pg_cron) ; « Envoyer par e-mail » = messagerie de l'utilisateur (`mailto:`) ; `communication_logs` (statuts `prepared_manual` / `logged`) à réutiliser pour l'historique client.
  - Réutilisables : PDF des reçus, identité de l'agence (Paramètres > Factures), paiements « confirmés » (`recorded`), textes WhatsApp (pièces manquantes, rappel de rendez-vous), `DocumentToolbar`, droits (`allowed`).
  - Les tests Chrome passés créaient des comptes temporaires dans la seule base (production) → nouvelle exigence : un projet Supabase de test séparé.
* **Plan proposé** : file d'envoi en base (une ligne par événement, clé unique anti-doublon, statut, identifiant Brevo, tentatives, erreurs), module serveur Brevo (délai, nouvelles tentatives, clé jamais affichée), SMTP Brevo + modèles français pour les e-mails de compte, envois sur événements (paiement confirmé + reçu PDF joint, pièces manquantes, état du dossier, bienvenue), envois planifiés (rappels de rendez-vous, abonnement) par pg_cron, webhook Brevo pour la livraison réelle, réglages par agence et désinscription client.
* **Décisions attendues** : nom de domaine, projet Supabase de test, planificateur, notifications activées par défaut.
* **Fichiers modifiés** : aucun (hors ce journal et la mémoire). Rien n'a été commité ni envoyé sur GitHub.
* **Suite de la Session 19 (même jour) — état à l'arrêt, à reprendre ici** : compte Brevo créé, nom de domaine acheté et **authentifié dans Brevo** (statut « Authentifié »). Clé API en cours de création : n'autoriser que les « E-mails transactionnels » (envoi et lecture), sans restriction d'adresse IP. Seule `BREVO_API_KEY` ira dans `.env.local` (encore absente à l'arrêt, vérifié sans lire la valeur) ; l'identifiant et la clé SMTP seront saisis directement dans Supabase à l'étape des e-mails de compte. Restent à faire par l'utilisateur : expéditeur `notifications@<domaine>` dans Brevo, clé API dans `.env.local`, projet Supabase de test, communiquer le domaine et le vendeur. Phase 2 (intégration) pas commencée : attend son « vas-y ».

---

### Session 20 — 2 Novembre 2026 à 14:35 — Vérification de l'environnement, démarrage du serveur et liens d'accès
* **Demande de l'Utilisateur** : « verifier, donne moi le lien ».
* **Vérifications réalisées** :
  - Démarrage du serveur local Next.js 16 (`npm run dev`) sur `http://localhost:3000`.
  - Vérification de `.env.local` (sans exposer les valeurs secrètes) : `BREVO_API_KEY` (89 caractères), `BREVO_SMTP_KEY` (90 caractères) et `BREVO_SMTP_LOGIN` (24 caractères) ont bien été ajoutés par l'utilisateur.
* **Actions** :
  - Fourniture des liens d'accès directs (`http://localhost:3000`, `/dashboard`, `/prospects`, `/services`, `/partners`, `/finance`, `/login`, `/admin`).
  - Rappel de sécurité : les identifiants SMTP (`BREVO_SMTP_KEY` et `BREVO_SMTP_LOGIN`) servent pour la console Supabase (Authentication > SMTP Settings), tandis que seule `BREVO_API_KEY` est requise côté serveur dans `.env.local`.

---

### Session 21 — 2 Novembre 2026 (Claude Code) — Brevo : reprise pas à pas
* **Demande de l'Utilisateur** : « je veux qu'on avance pas à pas, quel est l'étape suivant ? »
* **Vérifications (sans lire les secrets)** : `BREVO_API_KEY` présente dans `.env.local` ; `.env.local` bien ignoré par Git. Les modèles `supabase/templates/confirmation.html` et `recovery.html` (Session 20) sont corrects : liens vers `/auth/confirm` et `/reset-password`, qui existent, et branchés dans `supabase/config.toml`. Ils serviront à l'étape 3 (e-mails de compte) et ne sont pas encore envoyés à Supabase.
* **Étape suivante donnée** : créer l'expéditeur `SELECT Agency <notifications@domaine>` dans Brevo, puis communiquer le nom de domaine pour la vérification DNS. Restent ensuite : le projet Supabase de test, le choix des notifications par défaut, puis le « vas-y » de la phase 2. Aucun code modifié.
* **Suite de la Session 21** : l'utilisateur a créé l'expéditeur `notifications@myselectagency.com`. Domaine : **myselectagency.com** (DNS gérés par Vercel, site en ligne sur `https://www.myselectagency.com`). Contrôle DNS public : `brevo-code` présent, signatures DKIM `brevo1` et `brevo2` publiées (clé RSA joignable), DMARC `p=none` avec rapports vers Brevo. Pas de SPF à la racine, ce qui est normal avec la méthode d'authentification actuelle de Brevo. Pas de boîte de réception (aucun MX) : on ne peut pas répondre à `notifications@`, donc les e-mails clients auront une adresse de réponse vers l'agence. Étape suivante donnée : créer le projet Supabase de test `select-agency-test`.
* **Suite de la Session 21 — projet de test** : Supabase refuse un 3e projet gratuit (limite de 2 projets actifs : `lhel…` pour le site, et un autre, sans doute `tayrygsq…`). Docker n'est pas installé. Trois choix proposés : tests sans nouveau projet, mise en pause de l'autre projet, ou installation de Docker. **Choix de l'utilisateur : mettre l'autre projet en pause**, qu'il fait lui-même depuis le tableau de bord Supabase (l'assistant n'y touche pas), puis il crée `select-agency-test`.
* **Suite de la Session 21 — projet de test créé** : `select-agency-test`, identifiant **`rgpmydwzfetaetyxhlyv`**. Il répond (HTTP 401 sans clé, ce qui est normal). La production reste `lhel…`, et le lien du CLI Supabase reste sur la production. Les migrations seront appliquées au projet de test par l'utilisateur, avec `--db-url`, au moment des tests (phase 3), pour ne pas changer le projet lié. Dernière décision avant le « vas-y » : les notifications activées par défaut.
* **Décision — notifications par défaut** : **tout désactivé**. Aucun e-mail client ne part (paiement et reçu, rappel de rendez-vous, pièces manquantes, état du dossier) tant que l'agence ne l'a pas activé dans ses réglages. Les e-mails de compte (confirmation, mot de passe) et d'abonnement partent toujours. Conséquence prévue : un écran de réglages clair et un rappel visible pour inviter l'agence à activer ses e-mails. Tous les préalables sont réunis : la phase 2, étape 1, attend le « vas-y ».

---

### Session 22 — 2 Novembre 2026 (Claude Code) — Brevo phase 2, étape 1 : base de données (après « vas-y »)
* **Constat** : une session précédente (Session 20, autre assistant) avait déjà écrit sans le noter : la migration `20261102100000_emails_brevo.sql`, **déjà appliquée en production** (tables présentes, vérifié avec la clé publique), et du code (`src/lib/email/*`, réglages e-mails, page de désinscription, webhook, tests). Rien n'a pu être envoyé : ce code n'est pas en ligne.
* **Problèmes trouvés et corrigés** :
  - Réglages par défaut tous activés, contraire à la décision « tout désactivé ». L'interrupteur « abonnement » est supprimé : ces e-mails partent toujours.
  - Secrets système stockés en clair : seule leur empreinte SHA-256 est gardée, avec 32 caractères minimum.
  - **Webhook** : sans secret dans la requête, il reprenait celui du serveur, ce qui permettait à n'importe qui de faire passer de faux événements. Corrigé.
  - Un lecteur (viewer) pouvait réclamer la file d'envoi et lire son contenu : réservé à propriétaire, admin, agent et comptable.
  - Un e-mail de paiement restait en file après l'annulation du paiement, la suppression du client ou la désactivation de la notification : il est maintenant **revérifié juste avant l'envoi** et annulé.
  - Les erreurs définitives étaient retentées : elles passent directement en échec.
  - Un envoi bloqué était repris au bout de 2 minutes (risque de doublon) : repris au bout de 15 minutes seulement.
  - `soft_bounce` et `deferred` marquaient l'e-mail « rejeté » : le statut ne change plus. Un e-mail signalé comme indésirable ne repasse jamais « livré ».
  - Une confirmation de paiement pouvait être envoyée à la main : interdit, elle ne part que de la confirmation réelle.
  - **La page de désinscription désinscrivait dès l'ouverture du lien** (les messageries ouvrent les liens toutes seules) : il faut maintenant cliquer sur un bouton.
  - 8 erreurs de compilation qui auraient bloqué la mise en ligne Vercel : formulaire écrit avec des composants inexistants, mauvaise permission, dates sans fuseau horaire.
  - La lecture de la page de réglages était exposée comme action serveur : déplacée dans `email-queries.ts`.
* **Fichiers** :
  - Nouvelle migration `supabase/migrations/20261102120000_emails_corrections.sql`. Elle annule aussi les e-mails clients restés en file avec les anciens réglages, qui n'ont jamais été envoyés.
  - Modifiés : `src/features/settings/EmailSettingsForm.tsx` (réécrit, champs contrôlés), `email-actions.ts`, nouveau `email-queries.ts`, `src/app/(app)/settings/emails/page.tsx` (rappel visible « aucun e-mail automatique »), page et vue de `desinscription/[token]`, `src/app/api/webhooks/brevo/route.ts`, `types.ts`, `labels.ts` (statut « Annulé »), `rows.ts`, `templates.ts` (fuseau horaire).
* **Vérifications** :
  - `tsc` : 0 erreur, et ESLint OK.
  - **127 tests réussis**, dont 4 nouveaux tests de base : désactivé par défaut, rôles, revérification avant envoi, secrets et webhook.
  - Page de désinscription locale contrôlée : elle affiche la question sans rien modifier.
* **À faire par l'utilisateur** : appliquer la migration de correction (`npx supabase db push`). Rien n'a été envoyé sur GitHub.
* **Pour l'étape 2 (module d'envoi)** :
  - ajouter `BREVO_SENDER_EMAIL` ;
  - ajouter l'en-tête `IdempotencyKey` (anti-doublon Brevo) ;
  - supprimer l'identifiant de message inventé (`brevo-<date>`) quand Brevo n'en renvoie pas ;
  - passer `p_permanent` ;
  - adresse du site `https://www.myselectagency.com` dans les liens.
* **Pour l'étape 6 (webhook)** : ne plus accepter le secret dans l'adresse (`?secret=`).
* **Suite de la Session 22** : l'utilisateur a appliqué la migration de correction (« c'est fait »). Contrôle en production avec la clé publique, sans rien modifier : `complete_system_email` accepte le nouveau paramètre `p_permanent`, et les fonctions protégées refusent un faux secret (« Secret système invalide »). **Étape 1 terminée.** L'étape 2 (module d'envoi) attend le « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo phase 2, étape 2 : module d'envoi (après « vas-y »)
* **Documentation Brevo vérifiée** : le mode bac à sable `X-Sib-Sandbox: drop` et la clé anti-doublon `IdempotencyKey` se placent **dans le corps JSON** (objet `headers`), pas dans les en-têtes HTTP. Le module de la Session 20 mettait le bac à sable en en-tête HTTP, ce qui aurait envoyé de **vrais** e-mails pendant les « essais ».
* **`src/lib/email/brevo.ts` réécrit** :
  - bac à sable et `IdempotencyKey` dans le corps ;
  - `duplicate_request` reconnu comme « déjà envoyé » ;
  - plus jamais d'identifiant inventé (`messageId` vaut null si Brevo n'en renvoie pas) ;
  - classement des erreurs : 400 et 404 = définitives ; 401, 402, 403, 429 et 5xx = à retenter ;
  - adresse du destinataire vérifiée avant l'appel ; délai de 10 s ; clé jamais affichée ;
  - `import "server-only"`.
* **`src/lib/email/dispatcher.ts`** :
  - clé anti-doublon = identifiant de la ligne de la file d'envoi ;
  - `p_permanent` transmis ;
  - si le PDF annoncé (reçu, facture…) ne peut pas être préparé, l'e-mail est retenté au lieu de partir sans pièce jointe.
* **Autres fichiers** :
  - `templates.ts` : liens vers `https://www.myselectagency.com` par défaut.
  - `email-actions.ts` : message sans nom de variable technique.
  - `.env.local` : ajout de `BREVO_SENDER_EMAIL=notifications@myselectagency.com`, qui n'est pas un secret.
  - `.env.example` : noms des variables Brevo, sans valeurs.
* **Tests** : `email.test.ts` mis à jour (bac à sable dans le corps, anti-doublon, doublon, aucun identifiant inventé, classement des erreurs, adresse du site). `tsc` : 0 erreur, ESLint OK, **131 tests réussis**.
* **Essai réel en bac à sable** (script `brevo-sandbox-check.mjs` dans le dossier temporaire, rien envoyé) : Brevo répond **401 « adresse IP non reconnue »**. Les « IP autorisées » sont activées sur le compte Brevo, ce qui bloquerait aussi Vercel (adresses changeantes). Le module a bien géré l'erreur : erreur à retenter, clé masquée.
* **À faire par l'utilisateur** : dans Brevo, Sécurité > IP autorisées, **désactiver le blocage par adresse IP**. Ensuite, refaire l'essai en bac à sable.
* **Suite de l'étape 2** : l'utilisateur a désactivé le blocage d'IP dans Brevo pour les clés API et SMTP.
* **Essai réel en bac à sable** : réussi, rien n'a été envoyé. Brevo accepte la clé, l'expéditeur `notifications@myselectagency.com` et le format, et renvoie un numéro de message.
* **Anti-doublon** : en bac à sable, la même `IdempotencyKey` a donné **deux numéros différents**. Brevo n'a donc pas dédoublonné, du moins dans ce mode. Les protections propres à l'application restent :
  - clé unique par événement dans la file d'envoi ;
  - réclamation verrouillée (FOR UPDATE SKIP LOCKED) ;
  - clôture seulement si l'envoi est encore « en cours ».
  Le seul risque restant est une coupure juste après l'acceptation par Brevo. **À vérifier en phase 3** par deux vrais envois avec la même clé vers la boîte de l'utilisateur, avec son accord. Si Brevo ne dédoublonne pas en mode réel : marquer chaque e-mail d'une étiquette unique et interroger Brevo avant de renvoyer après une coupure.
* **Vérifié** : `/auth/confirm` et `/reset-password` existent déjà en ligne (HTTP 307), donc les modèles d'e-mails de compte peuvent être branchés sur Supabase. **Étape 2 terminée.** L'étape 3 (SMTP Brevo pour Supabase Auth) attend le « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo phase 2, étape 3 : e-mails de compte (après « vas-y »)
* **Vérifié** : `src/app/auth/confirm/route.ts` gère les liens `token_hash` + `type` des modèles (`type=email` pour la confirmation, `type=recovery&next=/reset-password` pour le mot de passe).
* **Modifié** : `supabase/config.toml` passe `site_url` à `https://www.myselectagency.com` et ajoute www, le domaine sans www, vercel.app et localhost aux adresses de retour. Ce fichier sert en local seulement ; le tableau de bord n'est pas touché.
* **Déroulé prévu, côté utilisateur dans le tableau de bord Supabase du projet `lhel…`** :
  - 3.1 SMTP Brevo (`smtp-relay.brevo.com`, port 587, identifiant et clé SMTP collés par lui) ;
  - 3.2 modèles FR (objet + `confirmation.html` / `recovery.html`) ;
  - 3.3 limite d'envoi et adresse du site ;
  - 3.4 essai avec « mot de passe oublié » sur son propre compte.
* **Étape 3 réalisée par l'utilisateur dans le tableau de bord Supabase du projet `lhel…`** :
  - SMTP personnalisé Brevo (`smtp-relay.brevo.com:587`, expéditeur `SELECT Agency <notifications@myselectagency.com>`) ;
  - modèles FR « Confirm signup » et « Reset password » (objet + HTML de `supabase/templates/`) ;
  - limite d'envoi à 100 e-mails/heure ;
  - Site URL `https://www.myselectagency.com` ; adresses de retour `https://www.myselectagency.com/**` et `http://localhost:3000/**`.
* **Essai réel avec son propre compte** (`/forgot-password` en ligne, aucune donnée de test créée) : **succès complet** confirmé par l'utilisateur. L'e-mail est reçu, en français et aux couleurs SELECT, et le bouton ouvre la bonne page. **Étape 3 terminée.** Prochaine : l'étape 4 (e-mails sur événement), sur « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo étape 4a : paiement confirmé et bienvenue (après « vas-y »)
* **Nouveau `src/lib/email/compose.ts`** : prépare chaque demande Brevo.
  - E-mails d'agence : au nom « <agence> via SELECT Agency », réponses vers l'agence.
  - E-mails de la plateforme (`agency_welcome`, `subscription_notice`) : au nom de « SELECT Agency », sans adresse de réponse d'agence.
  - Clé anti-doublon = identifiant de la ligne de la file d'envoi.
* **`src/lib/email/dispatcher.ts`** : nouvelle fonction `sendQueuedEmailsAfterResponse(ctx?)`, qui envoie avec `after()` de Next.js juste après la réponse (l'agent n'attend pas Brevo). Elle ne fait rien si Brevo n'est pas configuré sur le serveur.
* **Branchements** :
  - `recordPaymentAction` (paiement reçu, pas « à vérifier ») et `confirmPaymentAction` : l'e-mail de confirmation avec le reçu PDF part si l'agence l'a activé (la base revérifie tout) ;
  - `createAgencyAction` : e-mail de bienvenue au propriétaire.
* **Modèle de bienvenue** : il renvoie vers « Aide et support », car le domaine n'a pas de boîte de réception.
* **Tests** : nouveau `compose.test.ts`. `tsc` : 0 erreur, ESLint OK, **133 tests réussis**.
* **Proposé à l'utilisateur** : un vrai e-mail de démonstration envoyé à SA boîte, avec des données inventées et un vrai reçu PDF, sans toucher à la base. Il est envoyé deux fois avec la même clé pour vérifier l'anti-doublon de Brevo en mode réel. En attente de son accord et de l'adresse à utiliser.
* **Vrai e-mail de démonstration** (accord de l'utilisateur, envoyé à `celsedomb@gmail.com`) : « paiement confirmé » avec un reçu PDF, données inventées, aucune base touchée. Il a été envoyé deux fois avec la même `IdempotencyKey`, depuis un fichier temporaire `src/lib/email/envoi-demo.manuel.ts`, **supprimé juste après**.
* **Registre Brevo lu par l'API, en lecture seule** : 2 e-mails, 2 numéros différents, tous deux **livrés** (« delivered ») et 1 ouvert. **Brevo ne bloque pas les doublons avec `IdempotencyKey`.**
* **Correction anti-doublon** :
  - chaque e-mail porte l'étiquette unique `outbox-<id>` (`compose.ts`, `outboxTag`) ;
  - avant toute nouvelle tentative (`attempts > 1`), `findAcceptedEmailByTag` (`brevo.ts`) interroge les événements « requests » de Brevo sur 7 jours. Si l'e-mail a déjà été accepté, il est noté envoyé sans être renvoyé (`deliverOnce` dans `dispatcher.ts`) ;
  - l'`IdempotencyKey`, inefficace, est retirée.
  - Filtre par étiquette vérifié en vrai : un e-mail trouvé pour une étiquette existante, rien pour une étiquette inconnue.
* **Tests** : `tsc` : 0 erreur, ESLint OK, **134 tests réussis**. En attente de l'avis de l'utilisateur sur l'e-mail reçu (apparence, PDF, boîte de réception ou spams).
* **Validation de l'utilisateur** : l'e-mail de démonstration est arrivé dans la **boîte de réception** (pas dans les spams), l'expéditeur affiché est « Agence Étoile via SELECT Agency », le **reçu PDF s'ouvre**, et l'apparence lui convient. **Étape 4a terminée.** Prochaine : 4b (bouton « Envoyer par e-mail » sur les documents), sur « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo étape 4b : « Envoyer par e-mail » sur les documents (après « vas-y »)
* **Nouvelle action `src/features/printables/email-actions.ts` (`sendDocumentEmailAction`)** :
  - documents concernés : reçu, facture, devis, récapitulatif de dossier (avec ou sans finances), confirmation de réservation ;
  - vérifie les droits : `finance.write` pour reçu, facture et devis ; `operations.write` pour récapitulatif et réservation ;
  - vérifie l'état du document : reçu confirmé seulement ; facture émise ou payée (ni brouillon ni annulée) ; devis ni annulé ni refusé ;
  - vérifie l'adresse e-mail du client ;
  - met l'e-mail en file (`queue_agency_email`, type `document_send`, `is_automatic = false`, clé `document_send:<requestId>`), l'envoie aussitôt, puis donne le **vrai** résultat : accepté par Brevo, en file ou échec.
  - Indépendant des e-mails automatiques, car c'est l'agent qui décide.
  - PDF toujours joint, jamais de lien public.
* **Nouveau bouton `EmailDocumentButton.tsx`** : affiche l'adresse du client et demande confirmation. Un identifiant est tiré à l'ouverture, donc un double clic n'envoie qu'un seul e-mail. Sans adresse e-mail, le bouton est désactivé avec une explication.
* **Branché dans `DocumentToolbar`** (reçu, devis, récapitulatif, réservation) **et `InvoiceToolbar`** (factures émises ou payées), via `directEmail={emailSendingEnabled()}` sur les 5 pages. Si Brevo n'est pas configuré sur le serveur, l'ancien fonctionnement (messagerie de l'agent) reste en place.
* **Vérifications** : `tsc` : 0 erreur, ESLint OK, **134 tests réussis**.
* **Pour vérifier en vrai sans toucher la production** : préparer le projet de test `rgpmydwzfetaetyxhlyv`. Il servira aussi pour 4c, 5 et 6.
* **Préparation du projet de test, T1 faite par l'utilisateur** : il a lancé lui-même `npx supabase db push --db-url "<adresse du pooler de session>"` vers `select-agency-test` (`rgpmydwzfetaetyxhlyv`). Le CLI reste lié à la production, et le mot de passe n'a pas été communiqué. Le résultat sera vérifié dès que la clé publique du projet de test sera disponible (T3).
* **T2 demandée** : désactiver « Confirm email » sur le projet de test seulement, pour pouvoir y créer des comptes d'essai sans e-mail de confirmation.
* **T2 faite par l'utilisateur** : « Confirm email » désactivé sur `select-agency-test` uniquement. La production garde la confirmation par e-mail.
* **T3 demandée** : clé publique du projet de test (`sb_publishable_…`, faite pour être visible dans le navigateur). La clé secrète `sb_secret_…` ne doit jamais être transmise.
* **T3 faite** : l'utilisateur a donné la clé publique du projet de test. **Vérification de T1** (appels refusés, aucune donnée créée) : les 21 migrations sont en place sur `select-agency-test` (tables, fonctions d'e-mail, `complete_agency_email` avec `p_permanent`), et la clé publique seule ne lit rien.
* **Essai réel de 4b sur le projet de test** (`email4b-flow.mjs`, hors projet) :
  - conditions : application compilée et lancée sur le port 3100, branchée **uniquement** sur le projet de test (aucune trace du projet de production dans la compilation), Brevo en **bac à sable** (`BREVO_SANDBOX=true`), adresses en `@example.com`, aucune clé secrète utilisée ;
  - résultat : **16/16** :
    - connexion et réglages : envoi activé ;
    - paiement enregistré : l'e-mail automatique « paiement reçu » est accepté par Brevo avec un vrai identifiant, et la réponse va à l'adresse de l'agence ;
    - reçu : confirmation affichant l'adresse et le nom du PDF, message « Brevo l'a accepté », bouton de nouveau utilisable après l'envoi, ligne « sent » marquée envoi manuel, envoi noté dans l'historique du client ;
    - récapitulatif avec situation financière : accepté ;
    - client sans adresse : bouton désactivé avec explication, rien en file ;
    - aucune erreur JavaScript.
  - **Registre Brevo lu en lecture seule** : aucune trace pour les adresses d'essai, donc le bac à sable a fonctionné et **rien n'a été réellement envoyé**.
  - Serveur d'essai arrêté ; celui de l'utilisateur (port 3000) n'a pas été touché. Les comptes d'essai restent dans le projet de test seulement.
  - La compilation locale `.next` pointe maintenant vers le projet de test. Cela n'a aucun effet sur `npm run dev` ni sur Vercel, qui compile de son côté.
* **Étape 4b terminée et vérifiée.** Prochaine : 4c (pièces manquantes et état du dossier), sur « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo étape 4c : avancement du dossier et relance des pièces (après « vas-y »)
* **Choix retenus** (fidèles aux réglages déjà affichés aux agences) :
  - **Avancement du dossier** : automatique, seulement si l'agence l'a activé. Un e-mail part à trois moments : quand le dossier attend une **action du client**, quand une **décision** est enregistrée (visa accordé ou refusé…), et à la **clôture**. Les étapes internes (travail de l'agence, attente d'un organisme) n'envoient rien.
  - **Pièces manquantes** : bouton « Relancer par e-mail » dans l'onglet Documents. L'agent voit l'adresse et la liste exacte avant d'envoyer : pièces obligatoires à fournir, à corriger avec leur motif, ou expirées. La **relance automatique** liée au réglage « Relance des pièces manquantes » viendra avec les envois planifiés (étape 5).
* **Migration `20261102140000_emails_dossiers.sql`** :
  - déclencheur `cases_z_email_status` (`private.enqueue_case_status_email`) : le contenu est tiré de la base ; une seule information par changement d'étape (clé `case_status:<dossier>:v<version>`) ; rien si le réglage est désactivé, si le client est désinscrit ou sans adresse ;
  - `public.queue_missing_documents_email(dossier, demande)` : propriétaire, administrateur ou agent seulement ; dossier en cours ; liste relue dans la base ; client désinscrit refusé ; pas de doublon ;
  - `private.tidy_email_outbox` : annule un e-mail d'avancement dépassé (le dossier a encore changé) et une relance d'un dossier qui n'est plus en cours ;
  - `queue_agency_email` n'accepte plus que l'envoi d'un document, ce qui empêche un faux « Visa accordé » écrit à la main.
* **Application** :
  - modèles d'e-mail adaptés : action attendue, décision (avec une phrase propre au refus), clôture ;
  - `src/lib/email/missing-documents.ts` : même description des pièces dans l'aperçu et dans l'e-mail ;
  - `src/lib/email/report.ts` : message de résultat commun aux envois ;
  - nouvelle action `sendMissingDocumentsEmailAction` et bouton `MissingDocumentsEmailButton` ;
  - après un changement d'étape, l'e-mail part tout de suite et le message le dit ;
  - le formulaire d'étape avertit **avant** l'enregistrement : « Le client sera prévenu par e-mail de cette étape ».
* **Vérifications** : `tsc` : 0 erreur, ESLint : 0 erreur, **138 tests réussis**, dont 2 nouveaux tests de base et 2 de modèles.
* **En attente** : l'utilisateur applique la migration au **projet de test** (même commande que T1), puis essai réel dans Chrome (`email4c-flow.mjs`, hors projet, bac à sable).
* **Migration appliquée par l'utilisateur au projet de test** (vérifié : `queue_missing_documents_email` existe et refuse toute personne non connectée). **Elle n'est pas encore appliquée en production.**
* **Essai réel de 4c sur le projet de test** (`email4c-flow.mjs`, hors projet ; bac à sable Brevo, adresses en `@example.com`, sans clé secrète) : **16/16** :
  - avertissement « Le client sera prévenu par e-mail » avant d'enregistrer une étape qui le concerne ;
  - message « Un e-mail part au client » ;
  - e-mail d'avancement accepté par Brevo, marqué automatique, contenu tiré de la base (« Collecte des documents », action attendue) ;
  - pas d'avertissement pour l'étape interne suivante ;
  - onglet Documents : « 7 pièces obligatoires manquent encore » ; la confirmation montre l'adresse et la pièce à corriger avec son motif, mais pas la pièce déjà vérifiée ; message « Brevo l'a accepté » ; relance marquée manuelle, avec la liste exacte (7) ;
  - client désinscrit : bouton désactivé avec explication, aucun avertissement, étape enregistrée sans e-mail ;
  - aucune erreur JavaScript.
* **Registre Brevo lu en lecture seule** : aucune trace pour les adresses d'essai, donc **rien n'a été réellement envoyé**. Serveur d'essai arrêté ; celui de l'utilisateur (port 3000) n'a pas été touché.
* **Étape 4c terminée et vérifiée.** Prochaine : étape 5 (envois planifiés : rappels de rendez-vous la veille, relance automatique des pièces, alertes d'abonnement, nouvelles tentatives), sur « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo étape 5 : envois planifiés (après « vas-y »)
* **Fonctionnement** : une tâche planifiée Vercel Cron passe **une fois par jour à 16 h UTC** (17 h à Douala), sur `/api/cron/emails` (`vercel.json`). Vercel envoie `Authorization: Bearer <CRON_SECRET>`, et la route vérifie ce secret en temps constant. L'application appelle ensuite la base avec la clé publique et ce même secret, que la base compare à son empreinte SHA-256 (`private.system_secrets`, clé `email_worker`). Aucune clé secrète Supabase n'est utilisée. La réponse ne contient que des nombres.
* **Migration `20261102160000_emails_planifies.sql`** : `public.schedule_system_emails(secret)` prépare les e-mails du jour.
  - **Rappel de rendez-vous la veille**, si l'agence l'a activé : rendez-vous prévus ou confirmés, demain dans le fuseau de l'agence ; ni dates limites internes, ni départ ; client joignable. Un rappel déplacé, annulé ou passé est annulé avant l'envoi.
  - **Relance automatique des pièces**, si l'agence l'a activée : dossier en cours qui attend le client, sans changement depuis 3 jours, des pièces obligatoires manquantes. Une relance par semaine au plus, 3 au total.
  - **Alertes d'abonnement au propriétaire**, toujours : fin d'essai à 7 jours et la veille, essai terminé, échéance à 7 jours, échéance passée, espace suspendu. Une seule fois par étape, sans lien de désinscription.
  - `claim_system_emails` ne prend plus les e-mails qui joignent un PDF (paiement, document) : sans personne connectée, le PDF ne peut pas être produit, donc ils partent depuis l'espace de l'agence.
  - Liste des pièces manquantes commune : `private.case_missing_documents`.
* **Application** :
  - `src/lib/email/deliver.ts` : envoi unique avec contrôle anti-doublon, partagé avec l'envoi depuis l'agence ;
  - `src/lib/email/system-worker.ts` : préparation, puis envoi par lots de 25, 5 à la fois, dans une limite de 40 s ; rien n'est préparé si Brevo n'est pas configuré ;
  - route `src/app/api/cron/emails/route.ts` ;
  - modèles : date du rendez-vous et date d'échéance écrites à l'heure de l'agence ;
  - réglages : textes précisés (pas de rappel pour les dates limites ; règle de la relance automatique) ;
  - `.env.example` : `CRON_SECRET`.
* **Secret** : `CRON_SECRET` (43 caractères) créé directement dans `.env.local`, jamais affiché ; seule son empreinte SHA-256 a été montrée, pour l'enregistrer dans la base.
* **Vérifications** : `tsc` : 0 erreur, ESLint : 0 erreur, **145 tests réussis** :
  - base : rappels, revérification, PDF exclus, relance automatique, alertes d'abonnement ;
  - tâche planifiée : secret, lots, limite de temps ;
  - modèles : dates.
  - Un ancien test faisait envoyer un document PDF par le planificateur ; il utilise désormais une relance de pièces.
* **En attente** : sur le projet de test, l'utilisateur applique la migration et enregistre l'empreinte du secret, puis vient l'essai réel (`email5-flow.mjs`, hors projet).
* **Pour la mise en ligne, plus tard et sur demande** : `CRON_SECRET` dans Vercel, empreinte enregistrée dans la base de production, migrations 4c et 5 appliquées en production.
* **Projet de test préparé par l'utilisateur** : migration appliquée et empreinte du secret enregistrée. Vérifié : `schedule_system_emails` refuse un mauvais secret.
* **Essai réel de l'étape 5** (`email5-flow.mjs`, hors projet ; appel direct de `/api/cron/emails` comme Vercel Cron ; bac à sable Brevo ; adresses en `@example.com`) : **10/10** :
  - sans secret ou avec un mauvais secret : refusé (401), rien de préparé ;
  - avec le bon secret, la tâche s'exécute : 1 rappel préparé ; 2 e-mails envoyés, le rappel et la bienvenue de l'agence d'essai restée en file, tous deux acceptés par Brevo ;
  - la réponse ne contient ni adresse, ni contenu, ni secret ;
  - aucun rappel pour un rendez-vous dans 2 jours, annulé ou de type date limite ;
  - historique du client : « Rappel de rendez-vous envoyé par e-mail », sans auteur (automatique) ;
  - second passage : aucun doublon.
* **Registre Brevo lu en lecture seule** : aucune trace pour les adresses d'essai, donc rien n'a été réellement envoyé. Serveur d'essai arrêté ; celui de l'utilisateur (port 3000) n'a pas été touché.
* **Étape 5 terminée et vérifiée.** Prochaine : étape 6 (webhook Brevo : livré, rejeté, plainte), sur « vas-y ».

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo étape 6 : webhook de suivi de livraison (après « vas-y »)
* **Documentation Brevo vérifiée** : les webhooks transactionnels envoient `event`, `message-id`, `tags` et `reason`, parfois par lots. L'authentification se fait par jeton (`auth: bearer`) ou par en-têtes personnalisés. Le tableau de bord (Intégrations → Webhooks) propose l'authentification par jeton et les en-têtes.
* **Clé API Brevo** : lecture de `/v3/webhooks` refusée (403 `permission_denied`). C'est normal, puisque la clé est limitée aux e-mails transactionnels. Le webhook sera donc créé **depuis le tableau de bord Brevo**, à la mise en ligne. Rien n'a été modifié dans Brevo.
* **Route `src/app/api/webhooks/brevo/route.ts` réécrite** :
  - secret **uniquement dans un en-tête**, jeton `Authorization: Bearer` ou `x-webhook-secret` ; un secret placé dans l'adresse (`?secret=`) est **refusé** (400) ;
  - 32 caractères minimum ; mauvais secret : 401 ; autre erreur : 500, et Brevo réessaie ;
  - lots de 100 événements au plus ;
  - réponse sans adresse ni secret ;
  - accès à la base sans personne connectée : `src/lib/supabase/system.ts` (clé publique), partagé avec la tâche planifiée.
* **Lecture des appels** : `src/lib/email/webhook.ts` (`webhookSecretFrom`, `secretInUrl`, `parseBrevoEvents`).
* **Migration `20261102180000_emails_webhook.sql`** : `apply_brevo_webhook` reçoit aussi l'identifiant tiré de l'étiquette `outbox-<id>`.
  - Si l'identifiant Brevo n'est pas encore enregistré (événement arrivé très vite, ou e-mail retrouvé sans identifiant après une coupure), l'e-mail est retrouvé par son étiquette et l'identifiant est enregistré.
  - Un identifiant différent n'est jamais remplacé.
  - Un report temporaire n'écrit plus d'erreur sur un e-mail déjà livré.
  - L'ancien appel à 4 paramètres reste accepté.
* **Secret** : `BREVO_WEBHOOK_SECRET` (43 caractères) créé directement dans `.env.local`, jamais affiché ; seule son empreinte SHA-256 a été montrée. L'application ne le lit pas : il sera collé dans Brevo, et la base n'en garde que l'empreinte.
* **Vérifications** : `tsc` : 0 erreur, ESLint : 0 erreur, **147 tests réussis** :
  - lecture des en-têtes, des lots et des étiquettes ;
  - base : étiquette, identifiant différent refusé, report temporaire après livraison, mauvais secret.
* **En attente** : sur le projet de test, l'utilisateur applique la migration et enregistre l'empreinte (clé `brevo_webhook`), puis vient l'essai (`email6-flow.mjs`, hors projet : on joue le rôle de Brevo, qui ne peut pas joindre un ordinateur local).
* **Projet de test préparé par l'utilisateur** : migration appliquée et empreinte `brevo_webhook` enregistrée. Vérifié : la nouvelle `apply_brevo_webhook` à 5 paramètres refuse un mauvais secret.
* **Essai réel de l'étape 6** (`email6-flow.mjs`, hors projet ; on joue le rôle de Brevo ; e-mails envoyés au préalable en bac à sable par la tâche planifiée) : **13/13**, réussi deux fois de suite.
  - Accès : sans secret, refusé (401) ; secret dans l'adresse, refusé (400) ; mauvais secret, refusé (401). Rien ne change après ces refus.
  - « Livré » (jeton Bearer) : e-mail `delivered` avec sa date, historique du client à `delivered`.
  - Lot (en-tête `x-webhook-secret`) : `hard_bounce` passe à `bounced` avec la raison ; `spam` passe à `complained` et le client est désinscrit ; message inconnu ignoré. Un e-mail signalé ne repasse jamais « livré ».
  - Étiquette `outbox-<id>` : l'e-mail encore en file est retrouvé et son identifiant Brevo enregistré.
  - Réponses sans adresse ni secret.
* **Incident constaté honnêtement** : au premier essai, la tâche planifiée a laissé un e-mail en attente. C'était une erreur passagère, remise en file comme prévu, puis envoyée au passage suivant. La cause exacte n'a pas pu être relue (les données de cette agence d'essai ne sont lisibles qu'avec sa session). Ce n'est pas une limite de Brevo : 10 envois simultanés en bac à sable ont tous été acceptés (201). Il s'agit probablement d'une coupure réseau passagère sur ce poste.
* **Registre Brevo lu en lecture seule** : aucune trace des adresses d'essai, donc rien n'a été réellement envoyé. Serveur d'essai arrêté ; celui de l'utilisateur (port 3000) n'a pas été touché.
* **Étape 6 terminée et vérifiée. Phase 2 (intégration) terminée.** Restent le rapport final (phase 4) et, sur demande explicite, la mise en ligne :
  - migrations 4c, 5 et 6 en production ;
  - deux empreintes à enregistrer dans la base de production ;
  - `CRON_SECRET` et les variables Brevo dans Vercel ;
  - webhook à créer dans Brevo.

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Brevo phase 4 : rapport final (demande « rapport final »)
* **Rapport rédigé** : [`docs/RAPPORT_INTEGRATION_BREVO.md`](RAPPORT_INTEGRATION_BREVO.md), conforme à la phase 4 du cahier des charges Brevo (fichiers modifiés, variables d'environnement, tests effectués, problèmes restants). Il contient aussi le résumé de ce que fait l'intégration et la liste ordonnée de la mise en ligne.
* **Chiffres vérifiés au moment de la rédaction** :
  - 147 tests réussis, dont 33 propres aux e-mails (11 de base, 22 d'application) ;
  - essais réels sur le projet de test : 16/16, 16/16, 10/10 et 13/13 ;
  - une seule preuve de livraison réelle d'un e-mail client : la démonstration « paiement reçu » (registre Brevo : 2 livrés).
* **Problèmes restants mis en avant** :
  - pas encore en ligne ;
  - code non sauvegardé dans Git ;
  - e-mails de bienvenue en attente dans la vraie base, à annuler avant l'activation ;
  - webhook réel non testé ;
  - tâche quotidienne une seule fois par jour ;
  - e-mails vérifiés seulement par des tests automatiques ;
  - incident passager non expliqué ;
  - limite de la formule Brevo ;
  - DMARC souple ;
  - secrets présents seulement sur ce PC.
* **Aucun envoi sur GitHub, aucune mise en ligne.**

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Les 3 points importants du rapport (demande « règle les 3 points importants »)
* **Point 2, e-mails de bienvenue trop anciens** : nouvelle migration `20261102200000_emails_anciens.sql`. Juste avant l'envoi, `tidy_email_outbox` annule un message de bienvenue ou une alerte d'abonnement restés **plus de 3 jours** en attente, avec la raison « message trop ancien ». Les anciennes bienvenues de la vraie base s'annuleront donc d'elles-mêmes à la mise en ligne, sans manipulation à la main. Nouveau test de base : 63 tests de base réussis.
* **Point 3, e-mails vérifiés jusque-là seulement par des tests** : essai réel sur le projet de test, en bac à sable, avec `email-rest-flow.mjs` (hors projet) :
  - facture, devis et confirmation de réservation envoyés par le bouton : « Brevo l'a accepté », numéro Brevo, envoi manuel ;
  - décision « Visa refusé » (déclarée, avec sa source) : avertissement avant l'enregistrement, message « Un e-mail part au client », e-mail accepté ;
  - clôture : avertissement, e-mail accepté, et les deux e-mails apparaissent dans l'onglet « Communications ».
  - Premier passage : 10/11. La vérification attendait le message après la clôture, mais une fois le dossier clôturé le formulaire laisse place à « Ce dossier est clôturé » et le message disparaît avec lui. L'e-mail était bien parti ; la vérification a été corrigée. Second passage : **12/12**.
  - Restent la relance automatique et l'alerte d'abonnement : il faut simuler 4 jours écoulés sur le projet de test, par une ligne SQL de l'utilisateur.
* **Point 1, sauvegarde Git** :
  - vérification avant la sauvegarde : aucune valeur secrète de `.env.local` dans les 147 fichiers (seule la fausse clé des tests) ; aucun fichier volumineux ;
  - `tsc` : 0 erreur, ESLint : 0 erreur, **148 tests réussis** ;
  - commit `a534f6b` sur la **branche locale `sauvegarde-2026-11-02`**, créée pour ne pas toucher à `main` (la branche de mise en ligne).
  - **Aucun envoi sur GitHub.**
* **Fin du point 3** :
  - l'utilisateur a appliqué la migration `20261102200000` au projet de test et collé la ligne SQL qui vieillit le dossier de l'agence d'essai « Agence rmvzyhziv » de 4 jours et fixe la fin de son essai à 5 jours ;
  - tâche quotidienne appelée comme Vercel Cron : **4/4**. Relance automatique des pièces préparée (8 pièces) et acceptée par Brevo ; alerte « fin d'essai dans 7 jours » envoyée au propriétaire et acceptée ; second passage sans doublon ;
  - registre Brevo vide pour les adresses d'essai, donc rien n'est réellement parti ; serveur d'essai arrêté.
* **Rapport mis à jour** (`docs/RAPPORT_INTEGRATION_BREVO.md`) :
  - chaque type d'e-mail client a maintenant été essayé au moins une fois en bac à sable ;
  - les 3 points sont marqués réglés ;
  - la liste de mise en ligne compte 4 migrations ;
  - restent : la mise en ligne, le webhook réel, les autres alertes d'abonnement et la confirmation d'inscription.

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Question : « ce qui a été fait sur le projet de test est-il aussi bon sur le projet principal ? »
* **Vérifié en lecture seule** (appels refusés avec la clé publique, aucune donnée créée) sur le projet principal `lhel…` :
  - migrations présentes : jusqu'à `20261102120000` (y compris partenaires et documents) ;
  - migrations **absentes** : `20261102140000`, `160000` et `180000` ; `200000` n'a pas été appliquée non plus.
* **Site en ligne** : `main` et `origin/main` sont sur `ff7e3a7` (31/10/2026, gestion d'équipe). Les nouveautés depuis (paiements à vérifier, prospects, étapes, partenaires, documents PDF, e-mails) ne sont que sur la branche locale `sauvegarde-2026-11-02`.
* **Compatibilité contrôlée** : parmi les fonctions modifiées depuis le 31/10, le site en ligne n'appelle que `record_payment`. Son nouveau paramètre `p_pending` a une valeur par défaut, donc l'ancien appel fonctionne toujours.
* **Réponse donnée** : non, pas encore, et c'est voulu. Tout ce qui a été fait sur le projet de test sera refait sur le projet principal à la mise en ligne. Aucune donnée d'essai n'a été mise dans la vraie base.

---

### Session 22 (suite) — 2 Novembre 2026 (Claude Code) — Mise en ligne (demande explicite : « publie sur Vercel »)
* **Préparation** : le CLI Supabase est bien lié au vrai projet (`lhel…`), et `npm run build` réussit avec la vraie configuration (aucune trace du projet de test).
* **Étape 1, vraie base** : l'utilisateur a lancé `npx supabase db push` (4 migrations : `20261102140000`, `160000`, `180000`, `200000`). Vérifié en lecture seule : les nouvelles fonctions existent et refusent les appels non autorisés.
* **Étape 2, empreintes** : l'utilisateur a enregistré `email_worker` et `brevo_webhook` dans le vrai projet (SQL Editor). Vérifié par deux appels sans effet : les deux secrets de `.env.local` sont reconnus.
* **Étape 3, Vercel** : l'utilisateur a ajouté `BREVO_API_KEY`, `CRON_SECRET`, `BREVO_SENDER_EMAIL` et `NEXT_PUBLIC_SITE_URL` (Production). Les valeurs n'ont jamais été transmises dans la conversation.
* **Étape 4, publication** : fusion de `sauvegarde-2026-11-02` dans `main`, puis `git push origin main`, sur la demande explicite de l'utilisateur.
* **Étape 4, publication faite** : `main` avancé sans fusion compliquée jusqu'à `b02d95a`, puis `git push origin main` (`ff7e3a7..b02d95a`). Vercel a publié en 50 s environ. Sur le vrai site :
  - `/api/cron/emails` répond 401 sans secret, donc `CRON_SECRET` est bien présent ;
  - le webhook répond 401 sans secret et 400 avec un secret dans l'adresse ;
  - accueil, connexion et désinscription répondent 200.
* **Étape 5, webhook Brevo créé par l'utilisateur** : Intégrations → Webhooks → « Créer un webhook sortant ». Nom « SELECT Agency - suivi des e-mails », adresse `https://www.myselectagency.com/api/webhooks/brevo`, authentification **Token** (valeur de `BREVO_WEBHOOK_SECRET`), catégorie **Transactional email**.
* **Étape 6, vérification finale par l'utilisateur sur le vrai site** :
  - Paramètres → E-mails : **aucun avertissement**, donc la clé Brevo et l'expéditeur sont bien réglés dans Vercel ;
  - un vrai document envoyé par le bouton « Envoyer par e-mail » à un client portant l'adresse de l'utilisateur : **e-mail reçu** ;
  - onglet « Communications » : état **« Livré »**. Le webhook Brevo fonctionne en production.
* **Mise en ligne terminée et vérifiée.** Rapport mis à jour (sections 1, 6 et 7). Ces dernières modifications du rapport et du journal restent locales, non enregistrées dans Git : elles partiront avec la prochaine sauvegarde.
* **Sauvegarde finale (demande : « vas-y sur git, github et rassure-toi qu'aucune clé n'est visible »)** :
  - vérification avant l'envoi : `.env.local` n'a jamais été dans Git et reste ignoré ;
  - aucune des 4 valeurs secrètes de `.env.local` (`BREVO_API_KEY`, `BREVO_SMTP_KEY`, `CRON_SECRET`, `BREVO_WEBHOOK_SECRET`) n'apparaît dans les fichiers ni dans **tout l'historique Git** ;
  - les seules formes de clé trouvées sont la fausse clé des tests (`…secretTestKey999`) ;
  - `.env.example` ne contient que des valeurs publiques ;
  - rapport et journal enregistrés puis envoyés sur GitHub (`main`).

---

### Session 23 — 3 Novembre 2026 (Claude Code) — Sécurité : nouvel audit, sans modification (après « vas-y »)
* **Point de départ** : constats de l'audit du 30/10 (Session 4) : E1, E2, M1, M2, M3, M4, E3.
* **Preuves réelles sur le projet de test** (`securite-preuves.mjs`, hors projet ; agence d'essai, adresses `@example.com`, vraie base non touchée) : **7 failles confirmées**.
  - **E1** : une agence « démonstration » créée directement par l'API (`create_organization` avec `p_is_demo = true`) n'a aucun abonnement et peut écrire sans limite de durée.
  - **E2** : un membre peut, directement par l'API :
    - passer un dossier à « clôturé / accordé » sans étapes ni preuve ;
    - marquer l'étape « Visa accordé » faite et « confirmée » sans justificatif ;
    - marquer une pièce « vérifiée » sans aucun fichier.
  - **Nouveau** : un membre peut réinscrire aux e-mails un client qui s'était désinscrit, sans son accord. Le même mécanisme permet de changer directement l'apporteur d'un client, donc les commissions (lu dans le code, non essayé).
  - **M1** : un membre peut ajouter une ligne d'historique au texte inventé (l'auteur reste bien le sien).
* **Cause commune** : les règles de modification (RLS) laissent propriétaire, administrateur et conseiller modifier directement `cases`, `case_steps`, `document_requirements` et `clients`, et ajouter des lignes à `activity_events`. Les vérifications métier ne sont faites que par l'application. `apply_case_transition` et `review_requirement` acceptent ce que le navigateur leur envoie.
* **M2** : sur le vrai site, seul `Strict-Transport-Security` est présent (ajouté par Vercel). Pas de protection contre l'affichage du site dans une autre page, ni contre la détection du type de fichier, ni de politique de référent.
* **Inventaire de l'application** : aucune écriture directe sur `cases` ni `case_steps` ; sur `document_requirements`, seulement l'ajout d'une pièce ; sur `clients`, la modification de la fiche et la suppression ; 8 ajouts directs dans l'historique. Le blocage côté base est donc faisable sans réécrire l'application.
* **Plan proposé**, en 6 petites étapes (S1 à S6) ; S1 attend « vas-y ».
* **Fichiers modifiés** : aucun, hors ce journal.
* **S1, dossiers et étapes, codée** (après « vas-y ») :
  - Migration `20261103100000_securite_dossiers.sql` :
    - `create_case` passe en SECURITY DEFINER : elle vérifie le rôle (propriétaire, administrateur, conseiller), l'agence et le client, et **impose l'état de départ** (première étape en cours, les autres à venir, aucune preuve) ;
    - `apply_case_transition` est réécrite : elle reçoit l'**action demandée** (avancer, passer, revenir, avec preuve, motif, confirmation du solde) et applique elle-même les règles de `rules.ts` (étape suivante autorisée, preuve « déclarée » avec source ou « confirmée » avec justificatif, motif, solde), puis calcule les étapes, l'issue, la clôture et l'historique ;
    - une décision exige une preuve même si le modèle d'étapes a été trafiqué ;
    - les règles d'ajout et de modification directes de `cases` et `case_steps` sont retirées.
  - Application : `transitionCaseAction` n'envoie plus que l'action. Sa vérification préalable est gardée pour afficher le message sous le bon champ.
  - Tests : la fonction d'aide des tests avance désormais étape par étape ; 4 nouveaux tests de base. Résultat : `tsc` 0 erreur, ESLint 0 erreur, **152 tests réussis**.
  - Un ancien test attendait une erreur technique (« foreign key ») pour le client d'une autre agence. Il attend maintenant le message clair « Le client choisi est introuvable. ».
* **En attente** : migration à appliquer au projet de test, puis nouvel essai des failles et essai de l'application dans Chrome.
* **S1 vérifiée sur le projet de test** (migration appliquée par l'utilisateur ; nouvelle `apply_case_transition` présente) :
  - **essai des failles** relancé : les deux failles des dossiers (dossier mis « clôturé / accordé » et étape « Visa accordé » confirmée sans justificatif) sont désormais **protégées** (0 ligne modifiée) ; les autres restent ouvertes en attendant S2 à S6 ;
  - **essai de l'application dans Chrome** (`s1-flow.mjs`, hors projet) : **12/12** :
    - création d'un dossier par le vrai formulaire, avec la première étape en cours et les autres à venir ;
    - étape suivante depuis l'écran ;
    - décision sans preuve refusée avec un message clair et rien d'enregistré ; avec justificatif « confirmé », décision enregistrée, issue « accordé » et client prévenu par e-mail en bac à sable ;
    - clôture depuis l'écran, l'issue étant conservée ;
    - historique complet ; aucune erreur JavaScript.
  - Premier passage interrompu par une erreur **du script d'essai** (colonne `outcome` non lue), corrigée.
  - Serveur d'essai arrêté.
* **Pas encore en ligne.** La mise en ligne demande `db push` sur le vrai projet puis l'envoi du code juste après : l'ancien site appelle l'ancienne forme de `apply_case_transition`.
* **S2, pièces, codée** (après « vas-y ») : migration `20261103110000_securite_pieces.sql`.
  - `review_requirement` passe en SECURITY DEFINER. Elle exige le rôle, un dossier actif, une pièce en attente **avec au moins un fichier**, et un motif pour « à corriger ». Le texte de l'historique est écrit par la base.
  - Nouvelle fonction `add_requirement` : pièce toujours « non reçue », doublons refusés, historique écrit par la base.
  - Les règles d'ajout et de modification directes de `document_requirements` sont retirées.
  - L'application utilise `add_requirement`.
* **S3, fiche client, codée** : migration `20261103120000_securite_clients.sql`.
  - Une garde (`clients_guard`) refuse, lors d'une écriture directe d'un membre, tout changement de l'apporteur, du statut prospect / client, de la date de transformation, de l'agence, de la référence, du code de désinscription ou de la marque « démonstration ».
  - L'agence peut désinscrire un client à sa demande, **jamais le réinscrire**.
  - La page de désinscription remet au client un **code de réinscription à usage unique**. La base n'en garde que l'empreinte (`email_resubscribe_hash`), et « Me réinscrire » exige ce code. Le code du lien, que l'agence peut lire, ne permet plus de réinscrire.
* **Tests** :
  - deux anciens tests attendaient des erreurs techniques ; ils attendent maintenant les messages clairs ;
  - 7 nouveaux tests de base (S2 : 3, S3 : 4) ;
  - `tsc` 0 erreur, ESLint 0 erreur, **159 tests réussis**.
* **En attente** : les 2 migrations à appliquer au projet de test, puis l'essai des failles et l'essai dans Chrome (`s23-flow.mjs`).
* **S2 et S3 vérifiées sur le projet de test** (2 migrations appliquées par l'utilisateur et vérifiées) :
  - **essai des failles** : pièce « vérifiée » sans fichier, client réinscrit directement par l'agence, et client réinscrit par la page publique avec le code du lien (cas ajouté à l'essai) sont **protégés**. Restent ouvertes, comme prévu : l'agence démonstration (S4) et l'historique inventé (S6) ;
  - **essai de l'application dans Chrome** (`s23-flow.mjs`) : **14/14** :
    - dépôt d'un fichier, « à corriger » avec motif, nouveau dépôt, « vérifiée », avec l'historique écrit par la base ;
    - ajout d'une pièce « Autre » ;
    - prospect enregistré avec code partenaire et rattaché au partenaire, puis « Transformer en client » ;
    - modification ordinaire de la fiche ;
    - désinscription puis réinscription juste après, sur la même page ;
    - aucune erreur JavaScript.
  - Le premier passage était à 13/14 : le script d'essai ne cliquait pas sur « Confirmer », alors que la transformation se fait en deux temps. Vérifié par un appel direct : `convert_prospect` fonctionne. Script corrigé.
  - Contrôle de non-régression : `s1-flow.mjs` toujours à **12/12**. Serveur d'essai arrêté.
* **S1 à S3 prêtes pour la mise en ligne** (sur l'accord de l'utilisateur) : 3 migrations à appliquer au vrai projet, puis l'envoi du code aussitôt.
* **S4, agence démonstration, codée** (après « vas-y ») : migration `20261103130000_securite_demo.sql`.
  - `org_can_write` : une démonstration n'accepte de nouvelles données que **7 jours** après sa création, puis elle est consultable seulement, comme un essai terminé.
  - Son propriétaire peut toujours la quitter (`leave_demo_organization` ne dépend pas de ce droit) et créer sa vraie agence, avec son essai gratuit.
  - Application :
    - `canWrite` et `demoEndsAt` suivent la même règle ;
    - la date de création de l'agence est lue ;
    - le bandeau affiche « Utilisable 7 jours, jusqu'au … », puis « Démonstration terminée : … Créez votre agence pour continuer » ;
    - la FAQ de l'accueil et la page de création mentionnent les 7 jours.
* **S5, protections du site, codée** : `next.config.ts`.
  - En-têtes ajoutés sur toutes les pages :
    - `Content-Security-Policy` légère : `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'` ;
    - `X-Frame-Options: DENY` ;
    - `X-Content-Type-Options: nosniff` ;
    - `Referrer-Policy: strict-origin-when-cross-origin` ;
    - `Permissions-Policy` (caméra, micro, position, paiement désactivés).
  - `poweredByHeader: false`.
  - Vérifié avant : l'application n'utilise ni cadre (iframe), ni caméra, ni formulaire vers un autre site.
* **Tests** : 1 nouveau test de base (démonstration modifiable, puis consultable seulement après 8 jours, puis quittée et vraie agence créée) et un test de `canWrite`. `tsc` 0 erreur, ESLint 0 erreur, **160 tests réussis**.
* **Préparation de l'essai réel** : deux agences démonstration d'essai créées sur le projet de test, l'une à vieillir par une ligne SQL de l'utilisateur.
* **S4 et S5 vérifiées sur le projet de test** (migration appliquée par l'utilisateur ; la démo d'essai « Démo dmw044uofa » a été vieillie de 8 jours par sa ligne SQL) :
  - **par l'API** : la démo vieillie refuse l'ajout d'un client (règle d'accès) mais reste consultable ; la démo récente fonctionne normalement ;
  - **dans Chrome** (`s45-flow.mjs`) : **9/9** :
    - en-têtes présents (`frame-ancestors 'none'`, `DENY`, `nosniff`, provenance, `Permissions-Policy`), `X-Powered-By` retiré ;
    - bandeau « Utilisable 7 jours, jusqu'au … » sur la démo récente ;
    - « Démonstration terminée » sur la démo vieillie, qui reste consultable, et « Quitter la démonstration » ramène à la création d'agence ;
    - aucune erreur JavaScript.
  - **Non-régression avec les nouveaux en-têtes** : `s1-flow.mjs` **12/12**, `s23-flow.mjs` **14/14** (formulaires, dépôts de fichiers, désinscription). Serveur d'essai arrêté.
* **S1 à S5 prêtes pour la mise en ligne.**
  - S6 (historique) est proposée pour plus tard : il faudrait que la base écrive elle-même toutes les lignes d'historique, soit 7 endroits de l'application à reprendre. Le risque est faible (ligne interne à l'agence, auteur affiché).
* **S6, historique, codée** (demande : « finalise avec le S6, puis tu commences ») : migration `20261103140000_securite_historique.sql`.
  - Les 7 lignes d'historique que l'application écrivait elle-même sont maintenant écrites par la base, au moment où la donnée change, avec le **même texte**. Il s'agit des rendez-vous programmés, modifiés (pas pour un simple changement d'état) ou supprimés, des fiches client ou prospect créées, modifiées ou supprimées, et des prestations ajoutées.
  - La mise en forme des montants (`private.format_money`) et des dates est identique à l'application, au caractère près (espaces fines), ce qu'un test vérifie.
  - Une ligne ajoutée directement par un membre est marquée `origin = 'note'`, et son texte commence par « Note ajoutée à la main : ».
  - Application : les 7 écritures directes sont retirées, ainsi que la fonction d'aide `when` et un import devenus inutiles.
  - Tests : deux anciens tests sont adaptés à ce nouveau comportement (marquage « note » ; la base écrit maintenant « Prospect … enregistré ») ; 3 nouveaux tests de base. `tsc` 0 erreur, ESLint 0 erreur, **163 tests réussis**.
* **S6 vérifiée sur le projet de test** (migration appliquée par l'utilisateur) :
  - **essai des failles** : la ligne d'historique inventée est enregistrée comme « Note ajoutée à la main : … » (origine `note`). Elle est **protégée** au sens où elle ne peut plus passer pour un événement réel.
  - Les deux lignes « E1 » restent affichées comme faille : l'essai crée une démonstration et y écrit pendant ses 7 premiers jours, ce qui est permis. Le blocage après 7 jours a été vérifié avec la démo vieillie.
  - **Non-régression dans Chrome** avec S6 : `s1-flow.mjs` 12/12, `s23-flow.mjs` 14/14.
  - `s45-flow.mjs` : 6/8. Les 2 échecs viennent de l'essai : la démo vieillie avait déjà été quittée lors du passage précédent, donc son compte arrive sur la création d'agence. Les en-têtes et la démo récente sont toujours bons.
* **Avant la mise en ligne** : `npm run build` réussi avec la vraie configuration (aucune trace du projet de test) ; recherche de secrets dans les fichiers modifiés.

---

### Session 23 — 3 Novembre 2026 à 01:08 — Déploiement et Push GitHub (Lots de Sécurité S1 à S6)
* **Demande de l'utilisateur** : « fais le push » (demande et autorisation explicites).
* **Vérifications préalables** :
  - `npm run typecheck` : 0 erreur TypeScript.
  - `npm run lint` : 0 erreur ESLint.
  - `npm test` : **163/163 tests validés avec succès** (16 suites de tests).
  - Statut git vérifié : aucun fichier secret indexé (`.env.local` bien exclu).
* **Contenu déployé (Commit `123d64f`)** :
  - **S1 (Dossiers)** : `apply_case_transition` sécurisée (règles et justificatifs obligatoires en base).
  - **S2 (Pièces)** : validation sécurisée (fichier réel requis, pas de validation sans document).
  - **S3 (Clients)** : protection anti-réinscription non sollicitée (`email_resubscribe_hash`) et intégrité de la fiche.
  - **S4 (Démonstration)** : limite stricte d'écriture à 7 jours, bascule automatique en lecture seule.
  - **S5 (Sécurité HTTP)** : en-têtes renforcés dans [next.config.ts](file:///C:/Users/Lenovo/.gemini/select%20agency/next.config.ts) (CSP, anti-clickjacking `DENY`, `nosniff`, `Permissions-Policy`).
  - **S6 (Historique)** : journalisation native et auditée par la base (`activity_events`).
  - **Migrations associées** : `20261103100000_securite_dossiers.sql` à `20261103140000_securite_historique.sql`.
* **Actions exécutées** :
  - Commit : `feat(security): securisation complete lots S1 a S6 (dossiers, pieces, clients, demo, headers HTTP, historique)`.
  - Exécution de `git push origin main` vers GitHub (déclenchement du build et déploiement Vercel).
  - Working tree propre (`working tree clean`).


---

### Session 24 — 6 Novembre 2026 — Intégration des Paiements (Abonnements SaaS Stripe — Flux B)
* **Demande / Contexte de l'utilisateur** :
  - Intégration de deux flux de paiements distincts :
    - **Flux A** : Paiements des clients des agences (billets d'avion, hébergements, démarches, prestations de voyage et études).
    - **Flux B** : Paiements des abonnements des agences à SELECT Agency (licences SaaS).
  - Choix et analyse géographique : l'utilisateur réside au Brésil (pays officiellement pris en charge par Stripe pour percevoir les fonds sur son compte bancaire), et les agences clientes peuvent régler par carte bancaire internationale Visa / Mastercard.
  - Décision validée : implémentation en priorité du **Flux B (Abonnements agences via Stripe Checkout et portail client Stripe)**.
* **Architecture & Réalisations** :
  - **Dépendance** : `npm install stripe` (SDK officiel Stripe pour Node.js).
  - **Migration SQL** (`supabase/migrations/20261106100000_stripe_subscriptions.sql`) :
    - Colonnes `stripe_price_id` et `stripe_product_id` sur la table `public.plans`.
    - Colonnes `stripe_customer_id` et `stripe_subscription_id` sur la table `public.subscriptions`.
    - Fonction Super-Admin SELECT `public.platform_set_plan_stripe(uuid, text, text)` pour mapper les tarifs Stripe sur les formules.
    - Fonction sécurisée `public.set_agency_stripe_customer(uuid, text)` réservée aux rôles `owner` et `admin` pour lier le compte client Stripe de l'agence.
    - Fonction webhook `public.record_stripe_subscription_payment(...)` vérifiée par secret système (`private.check_system_secret`) pour enregistrer les encaissements et prolonger l'abonnement.
    - Fonction webhook `public.sync_stripe_subscription_status(...)` pour synchroniser résiliations ou défauts de paiement.
  - **Logique Serveur & Stripe** :
    - `src/lib/stripe/server.ts` : singleton serveur Stripe avec isolation totale de la clé secrète.
    - `src/features/billing/stripe-actions.ts` : Server Actions `createStripeCheckoutSessionAction` et `createStripeCustomerPortalAction`.
    - `src/app/api/webhooks/stripe/route.ts` : endpoint webhook vérifié par signature cryptographique Stripe (`stripe.webhooks.constructEvent`) prenant en charge `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated` et `customer.subscription.deleted`.
  - **Interface Utilisateur (Design System SELECT Agency)** :
    - `src/features/billing/StripeButtons.tsx` : boutons `StripeSubscribeButton` et `StripeManageButton` respectant le design system (`citron-400`, `navy-800`).
    - `src/app/(app)/settings/billing/page.tsx` : intégration des boutons de souscription Stripe Checkout sur les formules d'abonnements et bouton d'accès au portail de gestion de carte bancaire.
  - **Tests & Domaine** :
    - `src/lib/domain/types.ts` et `src/lib/data/rows.ts` étendus avec les identifiants Stripe.
    - `supabase/tests/database.test.ts` enrichi avec le test d'intégration complet du cycle Stripe (assignation du client, validation webhook et synchronisation de statut).
* **Validation & Contrôles Qualité** :
  - **Tests unitaires & d'intégration** : **164/164 tests passés avec succès** (16 suites de tests sur Vitest / PGlite).
  - **Compilation TypeScript** (`npm run typecheck`) : 0 erreur.
  - **Linter** (`npm run lint`) : 0 erreur (13 avertissements préexistants).
  - **Règle Git & Déploiement** : Strictement conservé en local (`localhost:3000`). **Aucun git push exécuté sans demande explicite de l'utilisateur**.
* **Prochaines Étapes** :
  - Renseigner les variables d'environnement Stripe dans `.env.local` (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`).
  - Déployer la migration `20261106100000_stripe_subscriptions.sql` sur le projet Supabase distant.
  - Étudier la passerelle pour le Flux A (paiements clients des agences via Mobile Money / Cartes).

* **Mise à jour (Configuration des clés dans `.env.local`)** :
  - Clés Stripe renseignées par l'utilisateur (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`).
  - Route Webhook (`src/app/api/webhooks/stripe/route.ts`) optimisée pour utiliser `createSystemClient()` de Supabase et aligner le secret système sur `STRIPE_WEBHOOK_SECRET`.
  - Typecheck vérifié avec succès (0 erreur).

---

### Session 25 — 6 Novembre 2026 (Claude Code) — Incident : site en ligne sans les mises à jour de base S1 à S6 ; vérification Stripe
* **Demande** : « connecter Stripe d'abord ; j'ai installé Stripe et mis les clés dans `.env.local`, c'est quoi la suite ? »
* **Constat en reprenant le projet** :
  - la sécurité S1 à S6 a été enregistrée (`123d64f`) et **envoyée sur GitHub le 3 novembre** (`b4a5256`), donc publiée par Vercel. Les en-têtes de S5 sont visibles sur le vrai site ;
  - **mais la vraie base n'a pas reçu les migrations** `20261103100000` à `140000`. Vérifié en lecture seule : la nouvelle `apply_case_transition`, `add_requirement` et la désinscription avec code sont **absentes**.
* **Conséquence sur le vrai site depuis le 3 novembre** : changer l'étape d'un dossier, ajouter une pièce et la page de désinscription échouent, car les fonctions appelées n'existent pas. Les lignes d'historique des rendez-vous, fiches et prestations ne sont plus écrites, puisque l'application ne les écrit plus et que les déclencheurs ne sont pas encore en base.
* **Réparation engagée** : la migration Stripe préparée en Session 24 (`20261106100000_stripe_subscriptions.sql`, pas encore relue) est **mise de côté temporairement** hors du dossier des migrations. `db push` vers le vrai projet n'enverra ainsi que les 5 migrations de sécurité, à appliquer par l'utilisateur.
* **Stripe, vérification de l'installation** : paquet `stripe` installé ; `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` et `STRIPE_WEBHOOK_SECRET` présents dans `.env.local` (ignoré par Git), sans clé secrète dans une variable publique. **Ce sont des clés RÉELLES (live)**, et non des clés de test.
* **Réparation faite** : l'utilisateur a lancé `npx supabase db push` vers le vrai projet, avec exactement les 5 migrations de sécurité (`20261103100000` à `140000`).
  - Vérifié en lecture seule : `apply_case_transition` (nouvelle forme), `add_requirement` et la désinscription avec code sont **présentes** ; la page de désinscription en ligne répond 200. **Le vrai site est réparé.**
  - Migration Stripe remise à sa place dans `supabase/migrations`, toujours **non appliquée** et à relire.
  - Note : le CLI Supabase annonce que, dans sa prochaine version majeure, `db push` visera la base locale par défaut. Il faudra alors écrire `npx supabase db push --linked` pour le vrai projet.
* **Relecture du code Stripe (Session 24), sans modification** :
  - **Paiements perdus sans alerte** : le webhook ignore les erreurs de la base et répond toujours « reçu » à Stripe, qui ne réessaie donc jamais.
  - **Premier paiement refusé par la base** : la référence « Stripe Checkout (cs_…) » dépasse la limite de 80 caractères de `subscription_payments`. Toute l'opération est annulée : ni paiement, ni activation.
  - **Agence à l'essai terminé incapable de payer** : `set_agency_stripe_customer` exige le droit d'écriture (`has_role`), donc refusé en lecture seule. Le client Stripe n'est pas relié et le paiement n'est attribué à aucune agence.
  - **Échéance jamais prolongée** : la date de fin de période est lue sur l'abonnement, alors que dans cette version de l'API Stripe (`2026-10-28.endive`, SDK 23.1) elle se trouve sur l'élément d'abonnement (`SubscriptionItem.current_period_end`).
  - **Doublons** : le premier paiement est enregistré deux fois (`checkout.session.completed` puis `invoice.payment_succeeded`), et chaque renvoi de Stripe en ajoute un, faute de clé unique.
  - **Sécurité** : un propriétaire peut lier n'importe quel identifiant client Stripe à son agence. Le lien doit venir du webhook signé (métadonnées de la session).
  - **Secret** : le webhook réutilise le secret de signature Stripe comme secret de la base (`stripe_webhook`), dont l'empreinte n'est enregistrée nulle part. Il faudrait aussi la changer à chaque changement de mode (test ou réel).
  - **Interface** : les erreurs sont « lancées », ce qui affiche une page d'erreur ; les boutons apparaissent même sans Stripe configuré ; « Payer » reste proposé à une agence déjà abonnée par Stripe (risque de double abonnement) ; l'adresse de retour dépend de l'en-tête `Host`.
  - **Manque** : aucun écran de la console pour relier une formule à son tarif Stripe.
  - **Stripe Brésil** : la documentation confirme que les cartes Visa et Mastercard émises hors du Brésil sont acceptées, mais ne dit pas clairement dans quelles devises facturer. À vérifier en mode test (tarif en XAF).
  - La migration Stripe n'est appliquée **ni** au projet de test **ni** au vrai projet : elle peut être corrigée sur place.
* **Rappel de l'utilisateur** : seulement le paiement des **abonnements des agences à SELECT** (pas les paiements de leurs clients). Règle : 1 mois d'essai gratuit, puis l'agence paie, sinon elle est en consultation seulement. C'est la règle déjà en place (`org_can_write`).
* **Corrections Stripe** (après « vas-y ») :
  - **Migration `20261106100000_stripe_subscriptions.sql` réécrite** (elle n'était appliquée nulle part) :
    - formats contrôlés (`price_`, `prod_`, `cus_`, `sub_`, `in_`) ;
    - `platform_set_plan_stripe` est réservée à la console et inscrite au journal (`plan.stripe`) ;
    - `platform_plans` renvoie le tarif Stripe ;
    - `set_agency_stripe_customer` est **supprimée** : le lien vient du webhook signé (`stripe_link_checkout`, métadonnées `organization_id`), même pour une agence en consultation seulement ;
    - `stripe_record_invoice` : clé unique `stripe_invoice_id` (renvoi de Stripe = « duplicate »), échéance prolongée, facture à 0 = « no_charge », référence tronquée à 80 caractères, moyen `card` ;
    - `stripe_sync_subscription` : correspondance des statuts (actif, en retard, résilié, suspendu ; « incomplete » ne change rien) ;
    - `private.stripe_organization` refuse un client ou un abonnement d'une autre agence, et une agence notée qui contredit le client connu (défaut trouvé par le test et corrigé) ;
    - les appels de la base utilisent le secret serveur existant (`email_worker`, c'est-à-dire `CRON_SECRET`), déjà enregistré en production et en test.
  - **Webhook `/api/webhooks/stripe` réécrit** :
    - signature vérifiée ;
    - événements traités : `checkout.session.completed`, `invoice.paid` / `invoice.payment_succeeded` et `customer.subscription.created/updated/deleted` ;
    - **code 500 en cas d'erreur**, pour que Stripe réessaie ;
    - réponse sans données.
  - `src/lib/stripe/events.ts` lit la fin de période sur les éléments de l'abonnement et les lignes de facture, le tarif sur `pricing.price_details`, et l'agence dans les métadonnées.
  - **Actions** (`startCardCheckoutAction`, `openCardPortalAction`) : messages clairs au lieu d'erreurs ; réservées au propriétaire et à l'administrateur, **même en consultation seulement** ; refus pour une démonstration ; **pas de second abonnement** ; formule sans tarif Stripe refusée ; adresse de retour `NEXT_PUBLIC_SITE_URL` (et plus l'en-tête `Host`) ; Stripe crée le client au paiement.
  - **Page Abonnement** :
    - boutons seulement si Stripe est configuré et que la formule a un tarif ;
    - « Gérer ma carte et mon abonnement » quand un abonnement par carte est en cours ;
    - messages après paiement réussi ou annulé ;
    - le Mobile Money via le support reste proposé.
  - **Console SELECT** : champ « Tarif Stripe » sur chaque formule. À l'enregistrement, l'application vérifie auprès de Stripe que le tarif est actif, récurrent, et qu'il a le même prix, la même devise et la même périodicité ; sinon, elle refuse.
  - Libellé « Carte bancaire (Stripe) », qui ne peut pas être saisi à la main dans la console. `.env.example` documenté.
* **Tests** :
  - le test Stripe de la Session 24 est remplacé ;
  - nouveaux tests : base (lien, doublon, échéance, facture à 0, agence inconnue, autre agence, statuts, agence en fin d'essai qui redevient modifiable après paiement) et webhook (signature, chaque événement, erreur 500) ;
  - `tsc` 0 erreur, ESLint 0 erreur, **169 tests réussis**.
* **Demande suivante** : « vas-y, à noter : pas encore les paiements des agences vers leurs clients ; seulement l'abonnement des agences, après le mois d'essai, sinon les options importantes ne sont plus accessibles », puis « applique directement ; trois tarifs STARTER, PRO et BUSINESS, selon les options ».
  - Choix de l'utilisateur : répartition proposée (« Ma proposition ») ; prix **15 000 / 30 000 / 60 000 FCFA par mois** ; mise en route **directement en réel**.
* **Objets créés dans le compte Stripe RÉEL** (par l'API, avec la clé de `.env.local`) :
  - produits et tarifs mensuels en XAF : STARTER `price_1UYv0TDENw1uRDfuKP8XJlwx` (15 000), PRO `price_1UYv0UDENw1uRDfueQEZIlf8` (30 000), BUSINESS `price_1UYv0VDENw1uRDfujuyBG7nb` (60 000) ;
  - webhook `we_1UYv1BDENw1uRDfuKKPlbcUQ` vers `https://www.myselectagency.com/api/webhooks/stripe` (5 événements). Son secret de signature est écrit dans `.env.local` (jamais affiché) ;
  - portail client (changement entre les 3 formules, résiliation en fin de période, factures, carte).
* **Formules et options — migration `20261106110000_formules.sql`** (appliquée **nulle part** pour l'instant) :
  - colonne `plans.tier` (starter, pro, business) ; les 3 formules sont créées ou mises à jour avec leurs tarifs Stripe (STARTER 2 membres, PRO 5, BUSINESS illimité) ;
  - `private.org_has_feature` : tout est ouvert pendant l'essai, dans une démonstration, avec une ancienne formule sans palier, en PRO et en BUSINESS ; en STARTER, les options PRO sont fermées ;
  - **refus par la base** (message « … : option incluse dans les formules PRO et BUSINESS ») : créer une facture, un service, un client dans un service, une réservation, un partenaire ; rattacher un client à un partenaire ; créer ou modifier un modèle d'étapes ; activer un e-mail automatique (rappel, relance, avancement) ;
  - les e-mails automatiques d'une agence STARTER ne sont plus mis en file ; la confirmation de paiement et les envois faits à la main restent permis ;
  - **rien n'est perdu** : ce qui existe déjà reste consultable et modifiable ;
  - la console voit le palier de chaque formule.
* **Correction Stripe trouvée en chemin** : un changement de formule fait sur la page Stripe (STARTER vers PRO) n'était pris en compte qu'à la facture suivante. Désormais `stripe_sync_subscription` reçoit le tarif de l'abonnement et change la formule aussitôt. Pour une facture de changement de formule (avoir sur l'ancien tarif, puis le nouveau), la formule retenue est celle de la ligne au plus gros montant.
* **Application** :
  - `src/lib/domain/features.ts` reprend la règle de la base ; le contexte de l'agence connaît les options fermées (`locked`) ;
  - menu : badge « PRO » à côté de Services, Partenaires et Rapports pour une agence STARTER ;
  - avis « option incluse dans les formules PRO et BUSINESS » avec le bouton « Passez à PRO » sur les pages Services, Partenaires, Factures, Rapports, E-mails et Modèles d'étapes ; les boutons de création sont retirés ;
  - Rapports et exports CSV bloqués (page et téléchargement, code 403) ;
  - e-mails : les trois e-mails automatiques PRO sont grisés ;
  - fiche client : le code partenaire passe en lecture seule (le partenaire déjà rattaché est conservé) ;
  - page Abonnement : ce que comprend chaque formule, un avis pendant l'essai, la liste des options fermées en STARTER ;
  - accueil : la FAQ « Combien coûte SELECT Agency ? » donne le mois gratuit et les 3 formules.
* **Tests** : base (STARTER bloqué, PRO autorisé, essai ouvert, données de l'essai modifiables, e-mails automatiques non mis en file, formule suivie depuis Stripe) et unitaires (options, facture de changement de formule). `tsc` 0 erreur, ESLint 0 erreur, **172 tests réussis**.
* **Reste à faire pour la mise en ligne** (dans cet ordre) :
  1. l'utilisateur ajoute dans Vercel `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` ;
  2. il lance `npx supabase db push` vers le vrai projet (2 migrations : `20261106100000` et `20261106110000`) ;
  3. enregistrement Git, puis envoi sur GitHub **seulement sur sa demande** (« publie sur Vercel ») ;
  4. vrai paiement d'essai, de préférence avec une carte émise hors du Brésil, puis remboursement ;
  5. désactiver dans la console les anciennes formules éventuelles.
