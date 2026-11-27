import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Pills } from "@/components/shared/navigation";
import { Notice, PageHeader } from "@/components/shared/ui";
import { formatDate } from "@/lib/format";
import { internationalPhone, whatsappHref } from "@/features/website/content";
import { getWebsiteMessages } from "@/features/website/queries";
import { WebsiteMessages, type MessageView } from "@/features/website/WebsiteMessages";
import { WebsiteSubNav, WebsiteSubNavWithCount } from "@/features/website/WebsiteSubNav";

export const metadata: Metadata = { title: "Site web — Messages reçus" };

export default function WebsiteMessagesPage({ searchParams }: PageProps<"/site-web/messages">) {
  return (
    <>
      <PageHeader
        title="Site web"
        description="Les messages envoyés par le formulaire « Contact » de votre site : rappelez la personne, puis marquez le message comme traité ou supprimez-le."
      />
      <Suspense fallback={<WebsiteSubNav active="messages" />}>
        <WebsiteSubNavWithCount active="messages" />
      </Suspense>
      <Suspense fallback={<PageSkeleton />}>
        <Messages searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const VIEWS = ["a-traiter", "traites", "tous"] as const;
type View = (typeof VIEWS)[number];

const EMPTY: Record<View, string> = {
  "a-traiter": "Aucun message à traiter. Les nouveaux messages du formulaire « Contact » de votre site arriveront ici.",
  traites: "Aucun message traité pour l'instant.",
  tous: "Aucun message pour l'instant. Les messages du formulaire « Contact » de votre site arriveront ici.",
};

async function Messages({ searchParams }: Pick<PageProps<"/site-web/messages">, "searchParams">) {
  const { vue } = await searchParams;
  const view: View = VIEWS.includes(vue as View) ? (vue as View) : "a-traiter";
  const data = await getWebsiteMessages();
  if (!data) {
    return <Notice>La liste des messages n&apos;est pas encore disponible : la mise à jour de la base de données est en attente.</Notice>;
  }
  if (data.locked && data.messages.length === 0) {
    return (
      <FeatureLocked feature="website">
        Votre formule STARTER ne comprend pas le site web. Passez en PRO ou BUSINESS pour créer le site de votre agence et recevoir ses messages.
      </FeatureLocked>
    );
  }

  const toHandle = data.messages.filter((m) => !m.handledAt);
  const handled = data.messages.filter((m) => m.handledAt);
  const shown = view === "a-traiter" ? toHandle : view === "traites" ? handled : data.messages;
  // Dates et numéros mis en forme ici, dans le fuseau et le pays de l'agence.
  const items: MessageView[] = shown.map((m) => ({
    id: m.id,
    clientId: m.clientId,
    bureau: m.bureau,
    firstName: m.firstName,
    lastName: m.lastName,
    phone: m.phone,
    phoneLabel: internationalPhone(m.phone, data.countryCode),
    whatsapp: whatsappHref(m.phone, data.countryCode),
    email: m.email,
    service: m.service,
    destination: m.destination,
    message: m.message,
    isNewClient: m.isNewClient,
    receivedLabel: formatDate(m.receivedAt, data.timezone, "dateTime"),
    handled: Boolean(m.handledAt),
    handledLabel: m.handledAt ? formatDate(m.handledAt, data.timezone, "dateTime") : undefined,
    handledBy: m.handledBy,
  }));

  return (
    <>
      <Pills
        label="Messages"
        active={view}
        items={[
          { key: "a-traiter", label: "À traiter", count: toHandle.length, href: "/site-web/messages" },
          { key: "traites", label: "Traités", count: handled.length, href: "/site-web/messages?vue=traites" },
          { key: "tous", label: "Tous", count: data.messages.length, href: "/site-web/messages?vue=tous" },
        ]}
      />
      <p className="mb-4 text-sm text-slate-600">
        Chaque message crée aussi une fiche dans Prospects (ou s&apos;ajoute à la fiche du client déjà connu) et une tâche « Rappeler ». Supprimer un message
        l&apos;enlève seulement de cette liste.
      </p>
      <WebsiteMessages key={view} messages={items} canManage={data.canHandle} emptyText={EMPTY[view]} />
    </>
  );
}
