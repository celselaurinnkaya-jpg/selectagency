import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Section, StatusBadge } from "@/components/shared/ui";
import { formatDate } from "@/lib/format";
import { BureauBadge } from "@/features/bureaux/BureauBadge";
import { internationalPhone, whatsappHref } from "./content";
import { MessageHandledButton } from "./MessageHandledButton";
import type { WebsiteMessage } from "./queries";

// « Messages reçus » : les demandes envoyées par le formulaire « Contact » du site de l'agence, à traiter
// d'abord, puis les messages déjà traités (repliés).

interface Props {
  messages: WebsiteMessage[];
  canHandle: boolean;
  timezone: string;
  countryCode: string;
}

export function WebsiteMessages({ messages, canHandle, timezone, countryCode }: Props) {
  const toHandle = messages.filter((m) => !m.handledAt);
  const handled = messages.filter((m) => m.handledAt);
  return (
    <Section
      id="messages"
      className="scroll-mt-24"
      title="Messages reçus par le site"
      action={
        <span className={`text-sm font-medium ${toHandle.length ? "text-orange-700" : "text-slate-600"}`}>
          {toHandle.length ? `${toHandle.length} à traiter` : messages.length ? "Tout est traité" : ""}
        </span>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Chaque message envoyé par le formulaire « Contact » de votre site arrive ici, avec son texte complet. Il crée aussi une fiche dans
        Prospects (ou s&apos;ajoute à la fiche du client s&apos;il est déjà connu) et une tâche « Rappeler ».
      </p>
      {messages.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-600">Aucun message pour l&apos;instant.</p>
      ) : (
        <div className="space-y-4">
          {toHandle.length > 0 && (
            <ul className="space-y-3">
              {toHandle.map((m) => (
                <MessageItem key={m.id} message={m} canHandle={canHandle} timezone={timezone} countryCode={countryCode} />
              ))}
            </ul>
          )}
          {handled.length > 0 && (
            <details className="rounded-xl bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-navy-800">Messages traités ({handled.length})</summary>
              <ul className="space-y-3 px-3 pb-3">
                {handled.map((m) => (
                  <MessageItem key={m.id} message={m} canHandle={canHandle} timezone={timezone} countryCode={countryCode} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Section>
  );
}

function MessageItem({ message: m, canHandle, timezone, countryCode }: { message: WebsiteMessage } & Omit<Props, "messages">) {
  const whatsapp = whatsappHref(m.phone, countryCode);
  return (
    <li className={`space-y-3 rounded-xl border p-4 ${m.handledAt ? "border-slate-200 bg-slate-50" : "border-navy-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {m.firstName} {m.lastName}
          </p>
          <p className="text-xs text-slate-500">Reçu le {formatDate(m.receivedAt, timezone, "dateTime")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <BureauBadge bureau={m.bureau} />
          <StatusBadge spec={m.isNewClient ? { label: "Nouveau prospect", tone: "info" } : { label: "Client déjà connu", tone: "neutral" }} />
        </div>
      </div>

      {(m.service || m.destination) && (
        <p className="text-sm text-slate-700">
          {m.service && (
            <>
              Service : <strong className="font-medium text-slate-900">{m.service}</strong>
            </>
          )}
          {m.service && m.destination && " · "}
          {m.destination && (
            <>
              Destination : <strong className="font-medium text-slate-900">{m.destination}</strong>
            </>
          )}
        </p>
      )}
      {m.message ? (
        <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-sm whitespace-pre-line text-slate-800">{m.message}</p>
      ) : (
        <p className="text-sm text-slate-500 italic">Pas de message écrit.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {m.phone && (
          <a href={`tel:${m.phone}`} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-navy-700 hover:underline">
            <Phone className="size-4" aria-hidden /> {internationalPhone(m.phone, countryCode)}
          </a>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 font-medium text-navy-700 hover:underline">
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
        )}
        {m.email && (
          <a href={`mailto:${m.email}`} className="inline-flex min-h-10 min-w-0 items-center gap-1.5 font-medium break-all text-navy-700 hover:underline">
            <Mail className="size-4 shrink-0" aria-hidden /> {m.email}
          </a>
        )}
        {m.clientId && (
          <Link href={`/clients/${m.clientId}`} className="inline-flex min-h-10 items-center font-medium text-navy-700 hover:underline">
            Ouvrir la fiche
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {m.handledAt ? (
          <p className="text-xs text-slate-500">
            Traité le {formatDate(m.handledAt, timezone, "dateTime")}
            {m.handledBy ? ` par ${m.handledBy}` : ""}
          </p>
        ) : (
          <span />
        )}
        {canHandle && <MessageHandledButton messageId={m.id} handled={Boolean(m.handledAt)} />}
      </div>
    </li>
  );
}
