# SELECT Agency — Règle de Déploiement et Gestion Git / GitHub / Vercel

## ⚠️ RÈGLE STRICTE ET ABSOLUE : AUCUN PUSH GITHUB SANS ACCORD EXPLICITE

### 1. Contexte et Risque
- Le dépôt GitHub `https://github.com/celselaurinnkaya-jpg/selectagency.git` est connecté directement à **Vercel** en intégration continue (CI/CD).
- Chaque fois qu'une commande `git push origin main` est exécutée, **Vercel déclenche immédiatement un déploiement en production visible publiquement sur Internet**.
- Pour éviter de publier des versions intermédiaires, des brouillons, des tests ou des modifications incomplètes, **AUCUN push vers GitHub ne doit être fait automatiquement**.

---

### 2. Directive Opérationnelle pour l'Assistant

1. **Travail Strictement Local par Défaut** :
   - Toutes les modifications de code, ajustements graphiques, tests, créations de composants et résolutions de bugs doivent être exécutés et testés **uniquement en local** (serveur dev local `localhost:3000`, `npm run build` local, etc.).
   - Tu peux valider que le code compile, fonctionne et respecte les critères en local.

2. **Interdiction Formelle du `git push` Automatique** :
   - **NE JAMAIS exécuter `git push` de ta propre initiative**, même après avoir terminé une tâche ou validé un build.
   - Ne jamais anticiper ou deviner le souhait de déploiement en ligne.

3. **Condition Unique pour Exécuter `git push`** :
   - Tu n'es autorisé à exécuter `git push` (ou envoyer les commits vers GitHub / Vercel) **QUE ET UNIQUEMENT SI L'UTILISATEUR LE DEMANDE EXPLICITEMENT** par des instructions claires comme :
     - *"envoie sur GitHub"* / *"mets le code sur GitHub"*
     - *"déploie sur Vercel"* / *"publie les changements"*
     - *"fais le git push"*
   - Si l'utilisateur ne donne pas cette consigne expresse, conserve le travail en local et présente-lui simplement le résultat pour revue.
