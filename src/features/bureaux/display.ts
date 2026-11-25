import type { Bureau, Member, Subscription } from "@/lib/domain/types";

// Bureaux de l'agence : règles d'affichage communes (badge, limite de la formule, bureaux d'un membre).

/** Nombre de bureaux de la formule (comme private.bureau_limit) ; undefined = sans limite (essai, BUSINESS…). */
export function bureauLimit(isDemo: boolean, subscription: Subscription | undefined): number | undefined {
  if (isDemo || !subscription || subscription.status === "trialing" || !subscription.plan?.tier) return undefined;
  if (subscription.plan.tier === "starter") return 1;
  if (subscription.plan.tier === "pro") return 3;
  return undefined;
}

/** Texte lisible sur la couleur du bureau : blanc ou presque noir selon le contraste. */
export function textOn(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#FFFFFF";
  const l = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.05) ? "#FFFFFF" : "#0F172A";
}

export const bureauById = (bureaux: Bureau[], id?: string) => (id ? bureaux.find((b) => b.id === id) : undefined);

/** Paramètre « ?bureau= » d'une liste : un bureau de l'agence, « aucun » (fiches sans bureau), sinon pas de filtre. */
export function parseBureauParam(value: unknown, bureaux: Bureau[]): string | undefined {
  if (value === "aucun") return "aucun";
  return typeof value === "string" && bureaux.some((b) => b.id === value) ? value : undefined;
}

/** La fiche (ou le paiement) correspond-elle au filtre de bureau ? */
export function matchesBureau(filter: string | undefined, bureauId: string | undefined): boolean {
  if (!filter) return true;
  return filter === "aucun" ? !bureauId : bureauId === filter;
}

/** Bureaux ouverts, proposés dans les formulaires. */
export const openBureaux = <T extends Bureau>(bureaux: T[]): T[] => bureaux.filter((b) => !b.archived);

/**
 * Choix du bureau dans un formulaire : bureaux ouverts, et le bureau actuel de la fiche s'il a été fermé. Avec la
 * visibilité par bureau, un membre cloisonné ne se voit proposer que ses propres bureaux (la base refuse les autres).
 */
export function bureauOptions(
  bureaux: Bureau[],
  currentId?: string,
  restrictTo?: { restrictByBureau?: boolean; member?: Pick<Member, "role" | "bureauIds"> },
): { value: string; label: string; code: string; name: string; city: string; color: string }[] {
  const restricted = Boolean(restrictTo?.restrictByBureau && restrictTo.member && !["owner", "admin"].includes(restrictTo.member.role));
  return bureaux
    .filter((b) => !b.archived || b.id === currentId)
    .filter((b) => !restricted || restrictTo?.member?.bureauIds?.includes(b.id) || b.id === currentId)
    .map((b) => ({
      value: b.id,
      label: `${b.code} — ${b.name}${b.archived ? " (fermé)" : ""}`,
      code: b.code,
      name: `${b.name}${b.archived ? " (fermé)" : ""}`,
      city: b.city,
      color: b.color,
    }));
}

/**
 * Bureau proposé par défaut pour une nouvelle fiche : celui du membre s'il n'en a qu'un parmi les bureaux ouverts.
 * Même règle que la base (private.single_bureau_of).
 */
export function defaultBureauFor(member: Pick<Member, "bureauIds"> | undefined, bureaux: Bureau[]): string | undefined {
  const mine = openBureaux(bureaux).filter((b) => member?.bureauIds?.includes(b.id));
  return mine.length === 1 ? mine[0]!.id : undefined;
}
