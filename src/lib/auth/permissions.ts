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
  "team.manage": ["owner", "admin"],
  "settings.manage": ["owner", "admin"],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}

export const FORBIDDEN_MESSAGE = "Votre rôle ne permet pas cette action. Demandez à un responsable de l'agence.";
