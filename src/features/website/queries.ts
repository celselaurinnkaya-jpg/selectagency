import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { countryName } from "@/lib/countries";
import { siteUrl } from "@/lib/env";
import { createSystemClient } from "@/lib/supabase/system";
import { websiteAiConfigured } from "./ai";
import { defaultContent, normalizeContent, slugify, type AgencyFacts, type SiteContent } from "./content";

// Site web de l'agence : données de l'éditeur (espace agence) et lecture publique (visiteurs, en cache).

/** Étiquette de cache d'un site publié : vidée à chaque publication ou mise hors ligne. */
export const siteCacheTag = (slug: string) => `site:${slug}`;

/** Adresse publique d'un site. */
export const publicSiteUrl = (slug: string) => `${siteUrl()}/site/${slug}`;

/** Ce que SELECT sait déjà de l'agence : nom, ville, coordonnées (réglages des factures), services actifs. */
export async function agencyFacts(ctx: Awaited<ReturnType<typeof getAgencyContext>>): Promise<AgencyFacts> {
  const [{ data: settings }, { data: services }] = await Promise.all([
    ctx.supabase.from("invoice_settings").select("phone, email, address").eq("organization_id", ctx.organizationId).maybeSingle(),
    ctx.supabase.from("services").select("name, description").eq("organization_id", ctx.organizationId).eq("is_active", true).order("name").limit(8),
  ]);
  return {
    name: ctx.agency.name,
    city: ctx.agency.city,
    countryName: countryName(ctx.agency.countryCode),
    phone: settings?.phone ? String(settings.phone) : undefined,
    email: settings?.email ? String(settings.email) : undefined,
    address: settings?.address ? String(settings.address) : undefined,
    services: (services ?? []).map((s) => ({ name: String(s.name), description: String(s.description ?? "") })),
  };
}

export interface WebsiteRow {
  slug: string;
  brief: string;
  draft?: SiteContent;
  published?: SiteContent;
  publishedAt?: string;
  isOnline: boolean;
}

export async function loadWebsiteRow(ctx: Awaited<ReturnType<typeof getAgencyContext>>): Promise<WebsiteRow | null> {
  const { data, error } = await ctx.supabase
    .from("agency_websites")
    .select("slug, brief, draft, published, published_at, is_online")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Lecture du site impossible : ${error.message}`);
  if (!data) return null;
  const draft = data.draft && Object.keys(data.draft as object).length > 0 ? normalizeContent(data.draft) : undefined;
  return {
    slug: String(data.slug),
    brief: String(data.brief ?? ""),
    draft,
    published: data.published ? normalizeContent(data.published) : undefined,
    publishedAt: data.published_at ? new Date(String(data.published_at)).toISOString() : undefined,
    isOnline: Boolean(data.is_online),
  };
}

/** Page « Site web » de l'agence. */
export async function getWebsiteEditor() {
  const ctx = await getAgencyContext();
  const [row, facts] = await Promise.all([loadWebsiteRow(ctx), agencyFacts(ctx)]);
  const slug = row?.slug ?? slugify(ctx.agency.name);
  const draft = row?.draft ?? defaultContent("horizon", facts);
  return {
    canEdit: allowed(ctx, "settings.manage"),
    locked: ctx.locked.includes("website"),
    writable: ctx.writable,
    aiConfigured: websiteAiConfigured(),
    slug,
    brief: row?.brief ?? "",
    draft,
    saved: Boolean(row?.draft),
    isOnline: row?.isOnline ?? false,
    publishedAt: row?.publishedAt,
    /** Le brouillon diffère-t-il de la version en ligne ? */
    hasUnpublishedChanges: Boolean(row?.draft && row.published && JSON.stringify(row.draft) !== JSON.stringify(row.published)),
    publicUrl: publicSiteUrl(slug),
    siteBase: `${siteUrl()}/site/`,
    countryCode: ctx.agency.countryCode,
    bureaux: await ctx.supabase
      .from("bureaux")
      .select("id, name, city")
      .eq("organization_id", ctx.organizationId)
      .is("archived_at", null)
      .order("name")
      .then(({ data }) => (data ?? []).map((b) => ({ id: String(b.id), name: String(b.name), city: String(b.city ?? "") }))),
    facts,
  };
}

/** Bureau proposé au visiteur dans le formulaire du site (nom et ville seulement). */
export interface SiteBureau {
  id: string;
  name: string;
  city: string;
}

export interface PublicSite {
  slug: string;
  content: SiteContent;
  countryCode: string;
  bureaux: SiteBureau[];
}

/** Site publié, pour les visiteurs (sans compte). En cache, vidé à chaque publication. */
export async function getPublicSite(slug: string): Promise<PublicSite | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteCacheTag(slug));
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) return null;
  const { data, error } = await createSystemClient().rpc("public_agency_website", { p_slug: slug });
  if (error) throw new Error(`Lecture du site impossible : ${error.message}`);
  if (!data) return null;
  const site = data as { slug: string; content: unknown; country_code: string; bureaux?: SiteBureau[] };
  return { slug: site.slug, content: normalizeContent(site.content), countryCode: site.country_code, bureaux: site.bureaux ?? [] };
}
