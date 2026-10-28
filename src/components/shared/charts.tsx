import { cn } from "cn";

// Graphiques légers en HTML/CSS : aucune bibliothèque à télécharger, lisibles sur petit écran.
// Chaque barre porte sa valeur en texte (pas d'information transmise par la couleur seule).

export function BarList({ items, emptyLabel }: { items: { label: string; value: number; display?: string }[]; emptyLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.label}</span>
            <span className="font-semibold tabular-nums text-navy-800">{item.display ?? item.value}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-navy-700" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MonthlyColumns({
  months,
  series,
}: {
  months: { key: string; label: string }[];
  series: { name: string; className: string; values: number[] }[];
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return (
    <div>
      <div className="flex h-40 items-end gap-2 sm:gap-4" role="img" aria-label={`Évolution sur ${months.length} mois`}>
        {months.map((month, index) => (
          <div key={month.key} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              {series.map((s) => {
                const value = s.values[index] ?? 0;
                return (
                  <div key={s.name} className="flex h-full w-full max-w-7 flex-col items-center justify-end gap-1">
                    <span className="text-xs font-semibold tabular-nums text-slate-700">{value}</span>
                    <div className={cn("w-full rounded-t-md", s.className)} style={{ height: `${Math.max(value > 0 ? 6 : 2, (value / max) * 100)}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4">
        {months.map((m) => (
          <span key={m.key} className="flex-1 text-center text-xs text-slate-600 capitalize">
            {m.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", s.className)} aria-hidden />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
