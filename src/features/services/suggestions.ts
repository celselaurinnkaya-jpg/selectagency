// Services courants des agences d'accompagnement : proposés pour remplir le formulaire en un clic.
// L'agence garde la main : elle renomme, complète ou ignore chaque suggestion.

export const SERVICE_SUGGESTIONS: { name: string; description: string }[] = [
  { name: "Hébergement", description: "Recherche et réservation du logement avant l'arrivée : résidence, studio ou colocation." },
  { name: "Garant", description: "Garant ou caution locative pour le logement, et constitution du dossier de garantie." },
  { name: "AVI (attestation de virement irrévocable)", description: "Ouverture du compte bloqué et obtention de l'attestation demandée pour le visa." },
  { name: "Assurance voyage", description: "Souscription de l'assurance voyage ou santé exigée pour le visa et le séjour." },
  { name: "Campus France", description: "Procédure Études en France : compte, candidatures, entretien et suivi des réponses." },
  { name: "Parcoursup", description: "Candidatures en première année d'études supérieures en France." },
  { name: "Écoles privées", description: "Candidatures directes auprès d'écoles privées et suivi des admissions." },
  { name: "Visa étudiant", description: "Constitution du dossier, prise de rendez-vous et dépôt de la demande de visa études." },
  { name: "Visa touristique", description: "Dossier de visa court séjour : pièces, rendez-vous et dépôt." },
  { name: "Billet d'avion", description: "Recherche, réservation et émission du billet d'avion." },
  { name: "Traduction et légalisation", description: "Traduction des documents et démarches de légalisation." },
  { name: "Accueil à l'arrivée", description: "Accueil à l'aéroport et aide à l'installation les premiers jours." },
];

/** Étapes proposées pour chaque nouveau service (même liste que la base : private.default_service_steps). */
export const DEFAULT_SERVICE_STEPS = [
  "Demande reçue",
  "Documents attendus",
  "Documents reçus",
  "Paiement vérifié (si nécessaire)",
  "Dossier transmis au partenaire",
  "Réception confirmée",
  "Traitement en cours",
  "Résultat reçu",
  "Résultat transmis au client",
  "Service terminé",
];
