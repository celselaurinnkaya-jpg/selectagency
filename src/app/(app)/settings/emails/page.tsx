import { Suspense } from "react";
import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { COMMUNICATION_STATUS, type LabelSpec } from "@/lib/domain/labels";
import type { EmailOutboxStatus } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { getEmailSettingsPage } from "@/features/settings/email-queries";
import { EmailSettingsForm, FlushEmailOutboxButton } from "@/features/settings/EmailSettingsForm";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Paramètres des e-mails" };

// « Envoyé » = accepté par Brevo ; « Livré » seulement après confirmation de Brevo (webhook).
const OUTBOX_STATUS_BADGE: Record<EmailOutboxStatus, LabelSpec> = {
  queued: COMMUNICATION_STATUS.queued,
  sending: { label: "En cours d'envoi", tone: "info" },
  sent: COMMUNICATION_STATUS.sent,
  delivered: COMMUNICATION_STATUS.delivered,
  bounced: COMMUNICATION_STATUS.bounced,
  complained: COMMUNICATION_STATUS.complained,
  failed: COMMUNICATION_STATUS.failed,
  cancelled: COMMUNICATION_STATUS.cancelled,
};

export default function EmailSettingsPage() {
  return (
    <>
      <PageHeader title="Paramètres" description="Expéditeur, adresse de réponse et e-mails automatiques envoyés à vos clients." />
      <SettingsNav active="emails" />
      <Suspense fallback={<PageSkeleton />}>
        <EmailSettingsContent />
      </Suspense>
    </>
  );
}

async function EmailSettingsContent() {
  const { agency, settings, recentEmails, canManage, readOnly, brevoReady, autoLocked } = await getEmailSettingsPage();
  const queuedCount = recentEmails.filter((e) => e.status === "queued").length;
  const noneEnabled =
    !settings.notifyPaymentConfirmed && !settings.notifyAppointmentReminder && !settings.notifyCaseStatus && !settings.notifyMissingDocuments;

  return (
    <div className="space-y-6">
      {!brevoReady && (
        <Notice tone="warning">
          L&apos;envoi des e-mails n&apos;est pas encore activé sur SELECT Agency. Vos réglages sont enregistrés et s&apos;appliqueront
          dès l&apos;activation.
        </Notice>
      )}
      {autoLocked && (
        <FeatureLocked feature="auto_emails">
          Avec la formule STARTER, la confirmation de paiement et les envois faits à la main (document, relance des pièces) restent
          disponibles. Les rappels, relances et avis d&apos;avancement automatiques sont inclus dans PRO et BUSINESS.
        </FeatureLocked>
      )}
      {noneEnabled && !autoLocked && (
        <Notice tone="info">
          Vos clients ne reçoivent aucun e-mail automatique pour l&apos;instant. Cochez ci-dessous ceux que vous souhaitez leur envoyer.
        </Notice>
      )}

      <Section title="Expéditeur et e-mails automatiques">
        {canManage ? (
          <Card>
            <EmailSettingsForm settings={settings} agencyName={agency.name} autoLocked={autoLocked} />
          </Card>
        ) : readOnly ? (
          <Notice tone="warning">
            L&apos;agence est en lecture seule : les paramètres seront de nouveau modifiables dès l&apos;activation de l&apos;abonnement.
          </Notice>
        ) : (
          <Notice>Seuls le propriétaire et les administrateurs peuvent modifier les réglages des e-mails.</Notice>
        )}
      </Section>

      <Section title="Derniers e-mails">
        {brevoReady && queuedCount > 0 && (
          <div className="mb-3">
            <FlushEmailOutboxButton queuedCount={queuedCount} />
          </div>
        )}
        {recentEmails.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Aucun e-mail pour le moment"
            description="Les e-mails envoyés à vos clients apparaîtront ici, avec leur état de livraison."
          />
        ) : (
          <ul className="space-y-2">
            {recentEmails.map((e) => (
              <li key={e.id}>
                <Card className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{e.subject}</span>
                    <span className="block text-xs text-slate-500">
                      À : {e.recipientName ? `${e.recipientName} (${e.recipientEmail})` : e.recipientEmail} ·{" "}
                      <span className="tabular-nums">{formatDate(e.createdAt, agency.timezone, "dateTime")}</span>
                    </span>
                    {e.lastError && <span className="mt-1 block text-xs text-slate-600">{e.lastError}</span>}
                  </div>
                  <StatusBadge spec={OUTBOX_STATUS_BADGE[e.status]} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
