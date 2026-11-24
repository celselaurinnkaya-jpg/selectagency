import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/env";
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
    title: { absolute: c.tagline ? `${c.agencyName} · ${c.tagline}` : c.agencyName },
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
  return <SiteRenderer content={site.content} slug={site.slug} />;
}
