// Traduit une erreur Supabase en message affichable. Les fonctions SQL écrivent leurs refus en
// français (raise exception, code P0001) : ceux-là sont montrés tels quels. Les autres erreurs
// techniques sont journalisées côté serveur et remplacées par un message générique.

interface DbError {
  code?: string;
  message: string;
}

export function dbMessage(error: DbError, fallback = "L'enregistrement a échoué. Réessayez dans un instant."): string {
  switch (error.code) {
    case "P0001":
      return error.message;
    case "42501":
      return "Votre rôle ne permet pas cette action. Demandez à un responsable de l'agence.";
    case "23505":
      return "Cet élément existe déjà.";
    case "23503":
      return "Un élément lié est introuvable dans votre agence, ou il est encore utilisé ailleurs.";
    case "23514":
      return "Une valeur saisie ne respecte pas le format attendu.";
    default:
      console.error("[supabase]", error.code, error.message);
      return fallback;
  }
}
