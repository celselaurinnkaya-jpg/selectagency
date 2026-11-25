import { selectClass } from "@/components/shared/form";
import type { Bureau } from "@/lib/domain/types";

/** Filtre « Bureau » des listes (clients, dossiers…) : tous, un bureau, ou les fiches sans bureau. */
export function BureauSelect({ bureaux, value, id = "bureau" }: { bureaux: Bureau[]; value?: string; id?: string }) {
  if (bureaux.length === 0) return null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        Bureau
      </label>
      <select id={id} name="bureau" defaultValue={value ?? ""} className={selectClass}>
        <option value="">Tous les bureaux</option>
        {bureaux.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code} — {b.name}
            {b.archived ? " (fermé)" : ""}
          </option>
        ))}
        <option value="aucun">Sans bureau</option>
      </select>
    </div>
  );
}
