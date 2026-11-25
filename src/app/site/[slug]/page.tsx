import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/env";
import { pageTitle } from "@/features/website/content";
import { SiteRenderer } from "@/features/website/SiteRenderer";
import { getPublicSite } from "@/features/website/queries";

// Site public d'une agence : myselectagency.com/site/<adresse>. Page en cache, vidée à chaque publication.

const absolute = (url: string) => (url.startsWith("/") ? `${siteUrl()}${url}` : url);

export async function generateMetadata({ params }: PageProps<"/site/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublicSite(slug);
  if (!site) return { title: { absolute: "Site introuvable" }, robots: { index: false } };
  const c = site.content;
  const description = c.seoDescription || c.hero.subtitle || undefined;
  return {
    title: { absolute: pageTitle(c) },
    description,
    alternates: { canonical: `${siteUrl()}/site/${site.slug}` },
    openGraph: {
      title: c.agencyName,
      description,
      url: `${siteUrl()}/site/${site.slug}`,
      type: "website",
      images: c.heroImageUrl ? [absolute(c.heroImageUrl)] : undefined,
    },
    icons: c.logoUrl ? { icon: c.logoUrl } : undefined,
  };
}

export default function PublicSitePage({ params }: PageProps<"/site/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <PublicSite params={params} />
    </Suspense>
  );
}

async function PublicSite({ params }: Pick<PageProps<"/site/[slug]">, "params">) {
  const { slug } = await params;
  const site = await getPublicSite(slug);
  if (!site) notFound();
  const c = site.content;
  const url = `${siteUrl()}/site/${site.slug}`;
  // Données structurées lues par Google (fiche « agence de voyages ») : seulement ce que l'agence a publié.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: c.agencyName,
    url,
    description: c.seoDescription || c.hero.subtitle || undefined,
    telephone: c.contact.phone || undefined,
    email: c.contact.email || undefined,
    address: c.contact.address ? { "@type": "PostalAddress", streetAddress: c.contact.address, addressCountry: site.countryCode } : undefined,
    logo: c.logoUrl || undefined,
    image: c.heroImageUrl ? absolute(c.heroImageUrl) : undefined,
    openingHours: c.contact.hours || undefined,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteRenderer content={c} slug={site.slug} countryCode={site.countryCode} bureaux={site.bureaux} />
    </>
  );
}
