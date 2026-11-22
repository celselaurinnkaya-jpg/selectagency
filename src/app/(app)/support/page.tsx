import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy, Mail, MessageCircle } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { TICKET_CATEGORY, TICKET_STATUS } from "@/lib/domain/labels";
import type { TicketCategory } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { listTickets } from "@/features/support/queries";
import { NewTicketForm } from "@/features/support/SupportForms";
import { SELECT_CONTACT, selectWhatsAppLink } from "@/lib/select-contact";

// Questions fréquentes : réponses courtes qui renvoient vers l'écran concerné (rapport de test v3, point 30).
const FAQ: { question: string; answer: React.ReactNode }[] = [
  {
    question: "Comment ajouter un membre à l'équipe ?",
    answer: (
      <>
        Menu <Link href="/team" className="font-medium text-navy-800 underline">Équipe</Link> → « Ajouter un membre ». Remplissez la fiche puis
        envoyez-lui le lien d&apos;invitation : en l&apos;ouvrant, il crée son compte (ou se connecte) et rejoint l&apos;agence. Le nombre de places
        dépend de votre formule.
      </>
    ),
  },
  {
    question: "Le propriétaire (ou un membre) est compté absent alors qu'il ne pointe pas",
    answer: (
      <>
        Tâches → <Link href="/tasks/presences#qui-pointe" className="font-medium text-navy-800 underline">Présences</Link> → section « Qui pointe ? » :
        cochez les personnes dispensées de pointage. Elles ne sont plus comptées absentes.
      </>
    ),
  },
  {
    question: "Comment enregistrer un paiement ?",
    answer: (
      <>
        Bouton « Nouveau » → <Link href="/finance/payments/new" className="font-medium text-navy-800 underline">Nouveau paiement</Link>, puis
        choisissez le dossier ; ou directement depuis le dossier, onglet Finance. Le paiement se répartit sur les prestations convenues du dossier et
        délivre un reçu numéroté.
      </>
    ),
  },
  {
    question: "Ma facture n'apparaît pas dans le reste à payer du dossier",
    answer: (
      <>
        Si le dossier n&apos;a encore aucune prestation, la facture émise y est ajoutée automatiquement. S&apos;il en a déjà, ouvrez la facture : un
        bouton l&apos;ajoute au reste à payer, après vérification qu&apos;elle ne reprend pas des prestations déjà saisies (sinon le client paierait
        deux fois).
      </>
    ),
  },
  {
    question: "Le client voit-il le motif quand je demande la correction d'une pièce ?",
    answer:
      "Oui, tel quel : dans le message WhatsApp ou l'e-mail de relance des pièces, et dans son espace client. Écrivez-le pour lui, sans remarque interne.",
  },
  {
    question: "Pourquoi la prochaine échéance de l'abonnement affiche « À fixer » ?",
    answer: (
      <>
        L&apos;équipe SELECT la fixe à l&apos;activation de votre abonnement. Si elle manque encore, faites une demande dans la catégorie « Abonnement et
        facturation » ci-dessous.
      </>
    ),
  },
  {
    question: "L'équipe SELECT voit-elle les données de mes clients ?",
    answer:
      "Non. Elle voit vos demandes de support, le nom de l'agence et celui de l'auteur de la demande, mais pas les fiches de vos clients ni leurs documents.",
  },
];

export const metadata: Metadata = { title: "Aide et support" };

export default function SupportPage({ searchParams }: PageProps<"/support">) {
  return (
    <>
      <PageHeader
        title="Aide et support"
        description="Une question, un problème, l'abonnement ? Écrivez à l'équipe SELECT : sa réponse apparaîtra ici, dans la demande."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Support searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Support({ searchParams }: Pick<PageProps<"/support">, "searchParams">) {
  const [{ categorie }, { tickets, agency, seesAll }] = await Promise.all([searchParams, listTickets()]);
  const category = typeof categorie === "string" && categorie in TICKET_CATEGORY ? (categorie as TicketCategory) : undefined;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title={seesAll ? "Demandes de l'agence" : "Vos demandes"}>
        {tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="Aucune demande pour le moment" description="Vos échanges avec l'équipe SELECT sont conservés ici." />
        ) : (
          <ul className="space-y-2">
            {tickets.map(({ ticket, author }) => (
              <li key={ticket.id}>
                <Link href={`/support/${ticket.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                  <Card className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{ticket.reference}</span>
                      <StatusBadge spec={TICKET_STATUS[ticket.status]} />
                    </div>
                    <p className="font-medium text-slate-900">{ticket.subject}</p>
                    <p className="text-xs text-slate-500">
                      {TICKET_CATEGORY[ticket.category]} · {author?.fullName ?? "—"} · mise à jour le {formatDate(ticket.updatedAt, agency.timezone, "dateTime")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Nouvelle demande" id="nouvelle-demande">
        <Card>
          <NewTicketForm defaultCategory={category} />
        </Card>
        <div className="mt-3">
          <Notice>
            L&apos;équipe SELECT voit votre demande, le nom de l&apos;agence et le vôtre. Elle n&apos;a pas accès aux fiches de vos clients ni à leurs
            documents : décrivez le problème sans y joindre de données personnelles de vos clients.
          </Notice>
        </div>
      </Section>

      <Section title="Questions fréquentes">
        <ul className="space-y-2">
          {FAQ.map((item) => (
            <li key={item.question}>
              <details className="group rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
                <summary className="flex min-h-10 cursor-pointer items-center font-medium text-navy-800">{item.question}</summary>
                <p className="mt-2 text-sm text-slate-700">{item.answer}</p>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Joindre l'équipe SELECT directement">
        <Card className="space-y-3">
          <p className="text-sm text-slate-700">
            Pour une urgence, ou pour envoyer une capture d&apos;écran, écrivez-nous sur WhatsApp en citant la référence de votre demande (SUP-…).
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={selectWhatsAppLink("Bonjour SELECT, ")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-navy-800 px-4 text-sm font-medium text-white hover:bg-navy-700"
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp {SELECT_CONTACT.whatsapp}
            </a>
            <a
              href={`mailto:${SELECT_CONTACT.email}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-800 hover:border-navy-300"
            >
              <Mail className="size-4" aria-hidden />
              {SELECT_CONTACT.email}
            </a>
          </div>
        </Card>
      </Section>
    </div>
  );
}
