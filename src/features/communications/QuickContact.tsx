import { MessageCircle, Phone } from "lucide-react";
import { cn } from "cn";

// Ouvrir une conversation WhatsApp (ou appeler) en un clic. L'agent écrit lui-même : rien n'est envoyé par SELECT
// et rien n'est noté tant qu'il ne note pas l'échange. Les fiches fictives de la démonstration n'ont pas de lien.

/** Chiffres du numéro WhatsApp (ou, à défaut, du téléphone) au format international, sans « + ». */
export function whatsappDigits(client: { phoneE164?: string; whatsappE164?: string; isDemoFixture?: boolean }): string | undefined {
  if (client.isDemoFixture) return undefined;
  const digits = (client.whatsappE164 || client.phoneE164 || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : undefined;
}

const base = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition";

export function QuickContact({
  client,
  compact = false,
  className,
}: {
  client: { firstName: string; phoneE164?: string; whatsappE164?: string; isDemoFixture?: boolean };
  /** Icônes seules (listes), avec un libellé pour les lecteurs d'écran. */
  compact?: boolean;
  className?: string;
}) {
  const digits = whatsappDigits(client);
  if (!digits) return null;
  const phone = client.isDemoFixture ? undefined : client.phoneE164;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <a
        href={`https://wa.me/${digits}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={compact ? `Écrire à ${client.firstName} sur WhatsApp` : undefined}
        className={cn(base, "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100", compact && "w-10 px-0")}
      >
        <MessageCircle className="size-4" aria-hidden />
        {!compact && "WhatsApp"}
      </a>
      {phone && (
        <a
          href={`tel:${phone}`}
          aria-label={compact ? `Appeler ${client.firstName}` : undefined}
          className={cn(base, "border-slate-200 bg-white text-slate-700 hover:border-navy-200 hover:text-navy-800 md:hidden", compact && "w-10 px-0")}
        >
          <Phone className="size-4" aria-hidden />
          {!compact && "Appeler"}
        </a>
      )}
    </span>
  );
}
