import type { MemberRole } from "@/lib/domain/types";

// Droits par rôle (plan §7.2). La matrice reproduit les politiques RLS de supabase/migrations :
// l'interface et les Server Actions s'en servent pour masquer une action ou afficher un message
// clair, mais la barrière finale reste la base de données.

export const PERMISSIONS = {
  "operations.write": ["owner", "admin", "agent"],
  "client.delete": ["owner", "admin"],
  "client.sensitive.read": ["owner", "admin", "agent"],
  "documents.read": ["owner", "admin", "agent", "accountant"],
  "finance.read": ["owner", "admin", "agent", "accountant"],
  "finance.write": ["owner", "admin", "agent", "accountant"],
  "payment.void": ["owner", "admin", "accountant"],
  "invoice.delete": ["owner", "admin", "accountant"],
  "team.manage": ["owner", "admin"],
  "team.transfer": ["owner"],
  "settings.manage": ["owner", "admin"],
  "services.manage": ["owner", "admin"],
  "billing.read": ["owner", "admin"],
  "reports.export": ["owner", "admin"],
  "finance.export": ["owner", "admin", "accountant"],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}

export const FORBIDDEN_MESSAGE = "Votre rôle ne permet pas cette action. Demandez à un responsable de l'agence.";

export const READ_ONLY_MESSAGE =
  "L'agence est en lecture seule : son abonnement est suspendu ou son essai est terminé. Le propriétaire peut le régler depuis Paramètres > Abonnement.";

// Écritures bloquées par la base quand l'abonnement ne permet plus d'écrire. La gestion de l'équipe
// reste ouverte : retirer l'accès d'une personne partie ne doit jamais être bloqué.
const WRITES = new Set<Permission>(["operations.write", "client.delete", "finance.write", "payment.void", "invoice.delete", "settings.manage", "services.manage"]);

/** Droit du rôle, et pour une écriture, abonnement qui permet d'écrire. */
export function allowed(ctx: { member: { role: MemberRole }; writable: boolean }, permission: Permission): boolean {
  return can(ctx.member.role, permission) && (ctx.writable || !WRITES.has(permission));
}

/** Message à afficher quand allowed() refuse. */
export function forbiddenMessage(ctx: { member: { role: MemberRole }; writable: boolean }, permission: Permission): string {
  return can(ctx.member.role, permission) ? READ_ONLY_MESSAGE : FORBIDDEN_MESSAGE;
}
