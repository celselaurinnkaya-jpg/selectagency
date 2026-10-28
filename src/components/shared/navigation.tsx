import Link from "next/link";
import { cn } from "cn";

// Onglets et filtres sous forme de liens : l'état vit dans l'URL (partageable, compatible
// avec le bouton retour, et fonctionnel même si le JavaScript n'est pas encore chargé).

export interface TabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export function TabNav({ items, active, label }: { items: TabItem[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-[3px] px-3 text-sm font-medium transition-colors",
                  isActive ? "border-navy-800 text-navy-800" : "border-transparent text-slate-600 hover:text-navy-800",
                )}
              >
                {item.label}
                {item.count !== undefined && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", isActive ? "bg-citron-400 text-navy-900" : "bg-slate-100 text-slate-600")}>
                    {item.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Pills({ items, active, label }: { items: TabItem[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-2">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  isActive ? "border-navy-800 bg-navy-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-navy-300",
                )}
              >
                {item.label}
                {item.count !== undefined && <span className={cn("text-xs", isActive ? "text-citron-300" : "text-slate-500")}>{item.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Construit une URL en conservant les filtres existants. */
export function withParams(path: string, current: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
