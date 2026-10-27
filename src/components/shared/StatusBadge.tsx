import React from "react";

export type BadgeVariant =
  | "blue" // Nouveau dossier / info
  | "orange" // Action requise / document manquant
  | "purple" // En cours de traitement
  | "amber" // En attente extérieure
  | "emerald" // Étape terminée (interne)
  | "rose" // Attention / annulé / problème
  | "slate"; // Neutre / archivé

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  className?: string;
}

export function StatusBadge({
  label,
  variant = "blue",
  icon,
  className = "",
}: StatusBadgeProps) {
  const styles: Record<BadgeVariant, string> = {
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    orange: "bg-amber-50 text-amber-800 border-amber-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    amber: "bg-yellow-50 text-yellow-800 border-yellow-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const dotColors: Record<BadgeVariant, string> = {
    blue: "bg-sky-500",
    orange: "bg-amber-500",
    purple: "bg-purple-500",
    amber: "bg-yellow-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    slate: "bg-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[variant]} ${className}`}
    >
      {icon ? (
        <span className="shrink-0">{icon}</span>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
