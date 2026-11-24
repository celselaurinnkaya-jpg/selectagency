import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { siteUrl } from "@/lib/env";
import { createSystemClient } from "@/lib/supabase/system";

// Plan du site lu par Google : l'accueil de SELECT et les sites des agences en ligne (mis à jour toutes les heures).

async function onlineSites(): Promise<{ slug: string; published_at: string | null }[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await createSystemClient().rpc("public_website_slugs");
  if (error) return [];
  return (data ?? []) as { slug: string; published_at: string | null }[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const sites = await onlineSites();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...sites.map((s) => ({
      url: `${base}/site/${s.slug}`,
      lastModified: s.published_at ? new Date(s.published_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
