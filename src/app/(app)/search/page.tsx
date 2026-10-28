import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, Section } from "@/components/shared/ui";
import { CATEGORY_SHORT_LABELS, CLIENT_TYPE } from "@/lib/domain/labels";
import { search } from "@/features/operations/queries";

export const metadata: Metadata = { title: "Recherche" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageHeader title="Recherche" description="Retrouvez un client par son nom, son téléphone ou sa référence, et un dossier par sa référence ou son intitulé." />
      <Suspense fallback={<PageSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const results = await search(query);
  const searched = query.trim().length >= 2;

  return (
    <div className="space-y-6">
      <Form action="/search" className="flex gap-2">
        <label htmlFor="q-page" className="sr-only">
          Rechercher
        </label>
        <Input id="q-page" name="q" type="search" defaultValue={query} placeholder="Nom, téléphone, CLI-…, DOS-…" className="flex-1" />
        <Button type="submit">
          <Search aria-hidden />
          Rechercher
        </Button>
      </Form>
      {searched && (
        <>
          <Section title={`Clients (${results.clients.length})`}>
            {results.clients.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun client trouvé.</p>
            ) : (
              <ul className="space-y-2">
                {results.clients.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`}>
                      <Card className="hover:ring-2 hover:ring-navy-200">
                        <span className="font-medium text-navy-800">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="block text-sm text-slate-600">
                          {c.reference} · {CLIENT_TYPE[c.clientType]} · {c.city}
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={`Dossiers (${results.cases.length})`}>
            {results.cases.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun dossier trouvé.</p>
            ) : (
              <ul className="space-y-2">
                {results.cases.map(({ travelCase: k, client }) => (
                  <li key={k.id}>
                    <Link href={`/cases/${k.id}`}>
                      <Card className="hover:ring-2 hover:ring-navy-200">
                        <span className="font-medium text-navy-800">{k.title}</span>
                        <span className="block text-sm text-slate-600">
                          {k.reference} · {CATEGORY_SHORT_LABELS[k.category]} · {client.firstName} {client.lastName}
                        </span>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
      {!searched && query && <p className="text-sm text-slate-600">Saisissez au moins deux caractères.</p>}
    </div>
  );
}
