import { cn } from "cn";
import type { Bureau } from "@/lib/domain/types";
import { textOn } from "./display";

/** Badge du bureau d'un client (« DLA » à sa couleur) : le conseiller voit d'un coup d'œil d'où vient le client. */
export function BureauBadge({ bureau, className, size = "sm" }: { bureau?: Bureau; className?: string; size?: "sm" | "lg" }) {
  if (!bureau) return null;
  const title = `Bureau : ${bureau.name}${bureau.city ? ` (${bureau.city})` : ""}${bureau.archived ? " — fermé" : ""}`;
  if (size === "lg") {
    return (
      <span title={title} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold", className)} style={{ background: bureau.color, color: textOn(bureau.color) }}>
        <span className="font-mono tracking-wide">{bureau.code}</span>
        <span className="font-normal opacity-90">· {bureau.name}</span>
      </span>
    );
  }
  return (
    <span
      title={title}
      className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-xs leading-4 font-bold tracking-wide", className)}
      style={{ background: bureau.color, color: textOn(bureau.color) }}
    >
      {bureau.code}
    </span>
  );
}
