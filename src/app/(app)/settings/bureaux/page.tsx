import { Suspense } from "react";
import type { Metadata } from "next";
import { Building } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { ROLE } from "@/lib/domain/labels";
import { SettingsNav } from "@/features/settings/SettingsNav";
import { BureauBadge } from "@/features/bureaux/BureauBadge";
import { ArchiveBureauButton, BureauForm, BureauRestrictionToggle, MemberBureauxForm } from "@/features/bureaux/BureauForms";
import { openBureaux } from "@/features/bureaux/display";
import { getBureauxPage } from "@/features/bureaux/queries";

export const metadata: Metadata = { title: "Bureaux" };

export default function BureauxPage() {
  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Les bureaux de votre agence (villes, points de vente) : chaque client porte le badge de son bureau, et les listes, rapports et caisses se filtrent par bureau."
      />
      <SettingsNav active="bureaux" />
      <Suspense fallback={<PageSkeleton />}>
        <Bureaux />
      </Suspense>
    </>
  );
}

async function Bureaux() {
  const { bureaux, members, canManage, isOwner, restrictByBureau, limit, canAdd, clientsWithoutBureau } = await getBureauxPage();
  const open = openBureaux(bureaux);
  const closed = bureaux.filter((b) => b.archived);

  return (
    <div className="space-y-6">
      {!canManage && <Notice>Seuls le propriétaire et les administrateurs de l&apos;agence gèrent les bureaux.</Notice>}

      <Section title="Bureaux de l'agence">
        {bureaux.length === 0 ? (
          <EmptyState
            icon={Building}
            title="Aucun bureau pour le moment"
            description="Une agence à une seule adresse n'en a pas besoin. Avec plusieurs bureaux, créez-les ici : chaque client portera le badge de son bureau."
          />
        ) : (
          <ul className="space-y-3">
            {[...open, ...closed].map((b) => (
              <li key={b.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <BureauBadge bureau={b} />
                      <span className="truncate font-semibold text-navy-800">{b.name}</span>
                      {b.archived && <StatusBadge spec={{ label: "Fermé", tone: "neutral" }} />}
                    </span>
                    <span className="text-sm text-slate-600 tabular-nums">
                      {b.clients} client{b.clients > 1 ? "s" : ""}
                      {b.city && ` · ${b.city}`}
                    </span>
                  </div>
                  {canManage && (
                    <details>
                      <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-medium text-navy-800">Modifier</summary>
                      <div className="mt-3 space-y-3">
                        <BureauForm bureau={b} />
                        <ArchiveBureauButton bureauId={b.id} archived={b.archived} />
                      </div>
                    </details>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canManage &&
          (canAdd ? (
            <Card className="mt-4">
              <h3 className="mb-3 font-semibold text-navy-800">Nouveau bureau</h3>
              <BureauForm />
            </Card>
          ) : (
            <div className="mt-4">
              <Notice tone="warning">
                Votre formule permet {limit} bureau{limit && limit > 1 ? "x" : ""}. Passez à une formule supérieure (Paramètres → Abonnement) pour en
                ajouter.
              </Notice>
            </div>
          ))}
        <p className="mt-2 text-xs text-slate-500">
          Bureaux par formule : STARTER 1, PRO 3, BUSINESS sans limite (sans limite pendant l&apos;essai). Un bureau fermé n&apos;est plus proposé ; ses
          clients et ses paiements le gardent.
        </p>
      </Section>

      {open.length > 0 && (
        <Section title="Membres de l'équipe et leurs bureaux">
          <Card className="space-y-4">
            <p className="text-sm text-slate-600">
              Un nouveau client prend automatiquement le bureau du conseiller qui le crée (s&apos;il n&apos;en a qu&apos;un) ; chaque paiement est noté
              dans le bureau où il est encaissé.
            </p>
            <ul className="divide-y divide-slate-100">
              {members.map((m) => (
                <li key={m.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-900">{m.fullName}</span>
                    <StatusBadge spec={ROLE[m.role]} />
                  </p>
                  {canManage ? (
                    <MemberBureauxForm memberId={m.id} bureaux={open} initial={(m.bureauIds ?? []).filter((id) => open.some((b) => b.id === id))} />
                  ) : (
                    <p className="flex flex-wrap gap-1.5">
                      {open.filter((b) => m.bureauIds?.includes(b.id)).map((b) => (
                        <BureauBadge key={b.id} bureau={b} />
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {open.length > 0 && (
        <Section title="Qui voit quels clients ?">
          <Card className="space-y-3">
            <p className="text-sm text-slate-700">
              {restrictByBureau ? (
                <>
                  <strong>Visibilité par bureau activée.</strong> Les conseillers, comptables et lectures seules ne voient que les clients de leurs
                  bureaux, et ceux sans bureau. Vous et les administrateurs voyez tout.
                </>
              ) : (
                <>
                  <strong>Chaque membre voit les clients de tous les bureaux</strong> (réglage actuel). Activez la visibilité par bureau pour qu&apos;un
                  conseiller ne voie que les clients de ses bureaux.
                </>
              )}
            </p>
            {clientsWithoutBureau > 0 && (
              <p className="text-xs text-slate-500">
                {clientsWithoutBureau} client{clientsWithoutBureau > 1 ? "s n'ont" : " n'a"} pas encore de bureau : visible{clientsWithoutBureau > 1 ? "s" : ""} par
                toute l&apos;équipe. Choisissez son bureau depuis sa fiche (Modifier).
              </p>
            )}
            {isOwner ? (
              <BureauRestrictionToggle on={restrictByBureau} />
            ) : (
              <p className="text-xs text-slate-500">Seul le propriétaire de l&apos;agence change ce réglage.</p>
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}
