import type { MemberRole } from "@/lib/domain/types";

// Invitations en attente (lisibles par les responsables de l'agence uniquement, voir la RLS).

export interface Invitation {
  id: string;
  email: string;
  role: Exclude<MemberRole, "owner">;
  jobTitle: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export const INVITATION_COLUMNS = "id, email, role, job_title, token, created_at, expires_at" as "*";

export function toInvitation(r: Record<string, unknown>): Invitation {
  return {
    id: String(r.id),
    email: String(r.email),
    role: r.role as Invitation["role"],
    jobTitle: String(r.job_title ?? ""),
    token: String(r.token),
    createdAt: new Date(String(r.created_at)).toISOString(),
    expiresAt: new Date(String(r.expires_at)).toISOString(),
  };
}

/** Rôles qu'un responsable peut attribuer par invitation (le propriétaire est celui qui crée l'agence). */
export const INVITABLE_ROLES = ["admin", "agent", "accountant", "viewer"] as const;
