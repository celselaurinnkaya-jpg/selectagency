import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader } from "@/components/shared/ui";
import { formatMoney } from "@/lib/format";
import { listCasesToCollect } from "@/features/finance/queries";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";

export const metadata: Metadata = { title: "Nouveau paiement" };

// Un paiement s'enregistre toujours dans un dossier (répartition sur les prestations, reçu, reste à payer) :
// cette page sert seulement à choisir le dossier, puis ouvre son onglet Finance sur le formulaire de paiement.
export default function NewPaymentPage({ searchParams }: PageProps<"/finance/payments/new">) {
  return (
    <>
      <PageHeader
        back={{ href: "/finance/payments", label: "Retour aux paiements" }}
        title="Nouveau paiement"
        description="Choisissez le dossier concerné : le paiement s'y répartit sur les prestations convenues, délivre un reçu et met à jour le reste à payer."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Cases searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Cases({ searchParams }: Pick<PageProps<"/finance/payments/new">, "searchParams">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const { rows, total, canSeeFinance, canWrite } = await listCasesToCollect(query);
  if (!canSeeFinance) return <FinanceRestricted />;
  if (!canWrite) return <Notice>Votre rôle permet de consulter les paiements, pas d&apos;en enregistrer.</Notice>;
  return (
    <div className="space-y-4">
      <Form action="/finance/payments/new" className="flex gap-2">
        <label htmlFor="q-payment" className="sr-only">
          Rechercher un dossier
        </label>
        <Input id="q-payment" name="q" type="search" defaultValue={query} placeholder="Client, DOS-…, intitulé" className="flex-1" />
        <Button type="submit">
          <Search aria-hidden />
          Rechercher
        </Button>
      </Form>
      {rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={query ? "Aucun dossier trouvé" : "Aucun dossier en cours"}
          description={query ? "Vérifiez l'orthographe, ou cherchez par la référence du dossier." : "Créez d'abord un dossier pour le client : le paiement s'y enregistre."}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map(({ travelCase: k, client, finance }) => (
              <li key={k.id}>
                <Link href={`/cases/${k.id}?tab=finance#paiement`}>
                  <Card className="flex flex-col gap-1 hover:ring-2 hover:ring-navy-200 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="font-medium text-navy-800">
                        {client.firstName} {client.lastName}
                      </span>
                      <span className="block text-sm text-slate-600">
                        <span className="font-mono">{k.reference}</span> · {k.title}
                      </span>
                    </span>
                    <span className="text-sm sm:text-right">
                      {finance.balanceMinor > 0 ? (
                        <>
                          <span className="block text-xs text-slate-500">Reste à payer</span>
                          <span className="font-semibold tabular-nums text-slate-900">{formatMoney(finance.balanceMinor, finance.currency)}</span>
                        </>
                      ) : finance.agreedMinor === 0 ? (
                        <span className="text-slate-600">Prestations à saisir d&apos;abord</span>
                      ) : (
                        <span className="text-emerald-700">Soldé</span>
                      )}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {total > rows.length && (
            <p className="text-sm text-slate-600">
              {rows.length} dossiers affichés sur {total} : précisez la recherche pour trouver les autres.
            </p>
          )}
        </>
      )}
    </div>
  );
}
