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
