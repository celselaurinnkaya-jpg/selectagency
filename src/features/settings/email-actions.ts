"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { flushAgencyEmailOutbox } from "@/lib/email/dispatcher";

const emailSettingsSchema = z.object({
  senderName: z.string().trim().max(120, "120 caractères au maximum.").optional(),
  replyToEmail: z
    .union([z.literal(""), z.email("Adresse e-mail de réponse invalide.").max(254)])
    .optional(),
  notifyPaymentConfirmed: z.boolean(),
  notifyAppointmentReminder: z.boolean(),
  notifyCaseStatus: z.boolean(),
  notifyMissingDocuments: z.boolean(),
});

export async function saveEmailSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = emailSettingsSchema.safeParse({
    senderName: values.senderName ?? "",
    replyToEmail: values.replyToEmail ?? "",
    notifyPaymentConfirmed: formData.get("notifyPaymentConfirmed") === "on",
    notifyAppointmentReminder: formData.get("notifyAppointmentReminder") === "on",
    notifyCaseStatus: formData.get("notifyCaseStatus") === "on",
    notifyMissingDocuments: formData.get("notifyMissingDocuments") === "on",
  });

  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) {
    return { message: forbiddenMessage(ctx, "settings.manage"), values };
  }

  const { error } = await ctx.supabase.rpc("save_email_settings", {
    p_organization_id: ctx.organizationId,
    p_settings: {
      sender_name: parsed.data.senderName ?? "",
      reply_to_email: parsed.data.replyToEmail ?? "",
      notify_payment_confirmed: parsed.data.notifyPaymentConfirmed,
      notify_appointment_reminder: parsed.data.notifyAppointmentReminder,
      notify_case_status: parsed.data.notifyCaseStatus,
      notify_missing_documents: parsed.data.notifyMissingDocuments,
    },
  });

  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Réglages des e-mails enregistrés." };
}

export async function retryQueuedEmailsAction(): Promise<FormState> {
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) {
    return { message: forbiddenMessage(ctx, "operations.write") };
  }
  const res = await flushAgencyEmailOutbox(ctx, 15);
  refresh();
  if (!res.configured) {
    return { message: "L'envoi des e-mails n'est pas encore activé sur SELECT Agency." };
  }
  if (res.claimed === 0) {
    return { ok: true, message: "Aucun e-mail en attente dans la file d'envoi." };
  }
  return {
    ok: res.failed === 0,
    message:
      res.failed === 0
        ? `${res.sent} e-mail(s) envoyé(s) via Brevo.`
        : `${res.sent} envoyé(s), ${res.failed} en échec (${res.lastError ?? "erreur Brevo"}).`,
  };
}

