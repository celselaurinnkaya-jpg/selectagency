import Link from "next/link";
import { cn } from "cn";

// Sous-menu de la page Tâches : les tâches de toute l'équipe, les miennes, et les présences (pointage).

export function TasksSubNav({ active, teamHref = "/tasks", mineHref = "/tasks?qui=moi" }: { active: "equipe" | "moi" | "presences"; teamHref?: string; mineHref?: string }) {
  const link = (key: typeof active, href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn("inline-flex min-h-10 items-center font-medium", active === key ? "text-navy-800 underline underline-offset-4" : "text-slate-600 hover:text-navy-800")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Sections des tâches" className="-mt-1 mb-4 flex flex-wrap gap-x-4 text-sm">
      {link("equipe", teamHref, "Toute l'équipe")}
      {link("moi", mineHref, "Mes tâches")}
      {link("presences", "/tasks/presences", "Présences")}
    </nav>
  );
}
