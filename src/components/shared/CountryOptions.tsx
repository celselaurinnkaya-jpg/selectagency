// Options d'une liste de pays : « Pays fréquents » en tête, puis « Tous les pays », séparés par des intitulés
// (rapport de re-test du 22/11 : sans séparateur, les pays d'Afrique semblaient affichés deux fois).
// byLabel : la valeur envoyée est le nom du pays (ex. la nationalité), pas son code.

export interface CountryOption {
  value: string;
  label: string;
  frequent?: boolean;
}

export function CountryOptions({ options, byLabel = false }: { options: CountryOption[]; byLabel?: boolean }) {
  const render = (list: CountryOption[]) =>
    list.map((c) => (
      <option key={c.value} value={byLabel ? c.label : c.value}>
        {c.label}
      </option>
    ));
  const frequent = options.filter((c) => c.frequent);
  const others = options.filter((c) => !c.frequent);
  if (frequent.length === 0 || others.length === 0) return <>{render(options)}</>;
  return (
    <>
      <optgroup label="Pays fréquents">{render(frequent)}</optgroup>
      <optgroup label="Tous les pays">{render(others)}</optgroup>
    </>
  );
}
