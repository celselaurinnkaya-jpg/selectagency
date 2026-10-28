import { cn } from "cn";
import { Label } from "@/components/ui/label";

// Briques de formulaire : étiquette reliée au champ, aide et message d'erreur accessibles.

export const selectClass =
  "h-10 w-full rounded-lg border border-input bg-white px-3 text-base text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm";

export function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm text-slate-800">
        {label}
        {required ? <span className="text-red-700" aria-hidden>*</span> : <span className="font-normal text-slate-500">(facultatif)</span>}
      </Label>
      {children}
      {hint && !error?.length && (
        <p id={`${id}-aide`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error?.length ? (
        <p id={`${id}-erreur`} className="text-sm text-red-700">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

/** Attributs ARIA à poser sur le champ pour relier l'aide et l'erreur. */
export function describedBy(id: string, error?: string[], hint?: string) {
  if (error?.length) return { "aria-invalid": true, "aria-describedby": `${id}-erreur` } as const;
  if (hint) return { "aria-describedby": `${id}-aide` } as const;
  return {};
}

export function FormMessage({ message, tone = "error" }: { message?: string; tone?: "error" | "success" }) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
      )}
    >
      {message}
    </p>
  );
}
