import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { countryName } from "@/lib/countries";
import { BUREAU, toBureau } from "@/lib/data/rows";
import type { Bureau } from "@/lib/domain/types";
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

/** Message envoyé par le formulaire « Contact » du site de l'agence (liste « Messages reçus »). */
export interface WebsiteMessage {
  id: string;
  clientId?: string;
  bureau?: Bureau;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  service: string;
  destination: string;
  message: string;
  /** Vrai : la demande a créé la fiche prospect ; faux : le numéro était déjà celui d'un client. */
  isNewClient: boolean;
  receivedAt: string;
  handledAt?: string;
  handledBy?: string;
}

const MESSAGE_COLUMNS =
  "id, client_id, bureau_id, first_name, last_name, phone_e164, email, service, destination, message, is_new_client, received_at, handled_at, handled_by";

/** Filtre de la page « Messages reçus par le site ». */
export type MessageFilter = "a-traiter" | "traites" | "tous";

/** Messages « à traiter » chargés au plus (bien au-delà d'un usage normal : le site accepte 100 demandes par jour). */
export const TO_HANDLE_SHOWN = 1000;
/** Messages déjà traités affichés : les plus récents. */
export const HANDLED_SHOWN = 200;

/**
 * « Messages reçus » par le site, les plus récents d'abord. Les messages « à traiter » sont toujours tous chargés
 * (aucun ne disparaît derrière des messages traités plus récents) ; les nombres viennent de la base, pas de la liste.
 * Null avant la migration 20261126100000.
 */
export async function getWebsiteMessages(filter: MessageFilter = "tous") {
  const ctx = await getAgencyContext();
  const messagesOf = (handled: boolean, rows: number) => {
    const query = ctx.supabase
      .from("website_messages")
      // head : seulement le nombre, aucune ligne lue.
      .select(MESSAGE_COLUMNS, { count: "exact", head: rows === 0 })
      .eq("organization_id", ctx.organizationId);
    const filtered = handled ? query.not("handled_at", "is", null) : query.is("handled_at", null);
    return rows > 0 ? filtered.order("received_at", { ascending: false }).limit(rows) : filtered;
  };
  const [open, done, { data: bureaux }, { data: members }] = await Promise.all([
    // Pour le filtre « Traités », seulement le nombre de messages à traiter (et inversement).
    messagesOf(false, filter === "traites" ? 0 : TO_HANDLE_SHOWN),
    messagesOf(true, filter === "a-traiter" ? 0 : HANDLED_SHOWN),
    ctx.supabase.from("bureaux").select(BUREAU.list).eq("organization_id", ctx.organizationId),
    ctx.supabase.from("members").select("id, full_name").eq("organization_id", ctx.organizationId),
  ]);
  if (open.error || done.error) return null;
  const rows = [...((open.data ?? []) as Record<string, unknown>[]), ...((done.data ?? []) as Record<string, unknown>[])].sort((a, b) =>
    String(b.received_at).localeCompare(String(a.received_at)),
  );
  const bureauById = new Map((bureaux ?? []).map((r) => [String(r.id), toBureau(r)]));
  const memberName = new Map((members ?? []).map((m) => [String(m.id), String(m.full_name ?? "")]));
  const toHandle = open.count ?? 0;
  const handled = done.count ?? 0;
  const messages: WebsiteMessage[] = rows.map((r) => ({
    id: String(r.id),
    clientId: r.client_id ? String(r.client_id) : undefined,
    bureau: r.bureau_id ? bureauById.get(String(r.bureau_id)) : undefined,
    firstName: String(r.first_name),
    lastName: String(r.last_name),
    phone: String(r.phone_e164 ?? ""),
    email: r.email ? String(r.email) : undefined,
    service: String(r.service ?? ""),
    destination: String(r.destination ?? ""),
    message: String(r.message ?? ""),
    isNewClient: Boolean(r.is_new_client),
    receivedAt: new Date(String(r.received_at)).toISOString(),
    handledAt: r.handled_at ? new Date(String(r.handled_at)).toISOString() : undefined,
    handledBy: r.handled_by ? memberName.get(String(r.handled_by)) || undefined : undefined,
  }));
  return {
    messages,
    /** Nombres exacts dans la base (pour les filtres), quel que soit le nombre de messages affichés. */
    counts: { toHandle, handled },
    /** Messages non affichés faute de place : traités plus anciens que les 200 derniers, ou « à traiter » au-delà de 1 000. */
    hidden: {
      handled: filter === "a-traiter" ? 0 : Math.max(0, handled - (done.data?.length ?? 0)),
      toHandle: filter === "traites" ? 0 : Math.max(0, toHandle - (open.data?.length ?? 0)),
    },
    canHandle: allowed(ctx, "operations.write"),
    locked: ctx.locked.includes("website"),
    timezone: ctx.agency.timezone,
    countryCode: ctx.agency.countryCode,
  };
}

/** Nombre de messages du site encore « à traiter » (alerte du tableau de bord). 0 avant la migration. */
export async function countWebsiteMessagesToHandle(): Promise<number> {
  const ctx = await getAgencyContext();
  const { count, error } = await ctx.supabase
    .from("website_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .is("handled_at", null);
  return error ? 0 : (count ?? 0);
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
