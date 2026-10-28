// État renvoyé par les Server Actions aux formulaires (useActionState).
// Les valeurs saisies sont renvoyées en cas d'erreur pour ne rien faire perdre à l'utilisateur.

export interface FormState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
  redirectTo?: string;
  duplicates?: { id: string; label: string; reasons: string[] }[];
}

export const initialFormState: FormState = {};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    values[key] = values[key] ? `${values[key]},${value}` : value;
  }
  return values;
}
