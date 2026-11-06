import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, can } from "@/lib/auth/permissions";
import { EMAIL_OUTBOX, EMAIL_SETTINGS, toEmailOutboxItem, toEmailSettings } from "@/lib/data/rows";
import { defaultSenderEmail, isBrevoConfigured } from "@/lib/email/brevo";

/** Données de la page « Paramètres > E-mails » : réglages de l'agence et 20 derniers envois. */
export async function getEmailSettingsPage() {
  const ctx = await getAgencyContext();
  const orgId = ctx.organizationId;
  const [settingsRes, outboxRes] = await Promise.all([
    ctx.supabase.from("email_settings").select(EMAIL_SETTINGS.list).eq("organization_id", orgId).maybeSingle(),
    ctx.supabase
      .from("email_outbox")
      .select(EMAIL_OUTBOX.list)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (settingsRes.error) throw new Error(`Lecture des réglages d'e-mails impossible : ${settingsRes.error.message}`);

  return {
    agency: ctx.agency,
    settings: toEmailSettings(settingsRes.data as Record<string, unknown> | null),
    // La file d'envoi n'est visible que des rôles qui suivent les dossiers et la caisse.
    recentEmails: ((outboxRes.data ?? []) as Record<string, unknown>[]).map(toEmailOutboxItem),
    canManage: allowed(ctx, "settings.manage"),
    autoLocked: ctx.locked.includes("auto_emails"),
    readOnly: can(ctx.member.role, "settings.manage") && !ctx.writable,
    brevoReady: isBrevoConfigured() && Boolean(defaultSenderEmail()),
    senderDomainEmail: defaultSenderEmail(),
  };
}
