import Image from "next/image";
import { cn } from "cn";

// Logo officiel, extrait du fichier fourni (aucun lettrage redessiné).
// « jaune » sur les fonds bleu marine, « bleu » sur les fonds clairs.
const SOURCES = {
  jaune: "/brand/logo-select-agency-jaune.png",
  bleu: "/brand/logo-select-agency-bleu.png",
} as const;

export function Logo({
  variant = "jaune",
  className,
  priority = false,
}: {
  variant?: keyof typeof SOURCES;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={SOURCES[variant]}
      alt="SELECT Agency"
      width={1200}
      height={427}
      priority={priority}
      className={cn("h-9 w-auto", className)}
    />
  );
}
