"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import type { FormState } from "@/lib/form-state";
import { AiUnavailableError } from "@/lib/ai/runner";
import { createSystemClient } from "@/lib/supabase/system";
import { toE164 } from "@/features/clients/phone";
import { generateSiteContent } from "./ai";
import { finalizeSlug, missingForPublication, normalizeContent, serviceMotive, SLUG_PATTERN, withInternationalPhones, type SiteContent } from "./content";
import { agencyFacts, getPublicSite, loadWebsiteRow, siteCacheTag } from "./queries";

// Actions du site web : enregistrer le brouillon, le faire rédiger par l'IA, publier, mettre hors ligne,
// ajouter une image ; et, pour les visiteurs, le formulaire de contact (prospect dans SELECT).

export interface WebsiteActionResult extends FormState {
  content?: SiteContent;
  url?: string;
  /** Adresse enregistrée (après retrait des accents et des tirets en trop). */
  slug?: string;
}

// Adresse : accents retirés et tirets en trop supprimés avant la vérification (« Test Claude é! » → « test-claude-e »).
const slugSchema = z
  .string()
  .transform((v) => finalizeSlug(v))
  .pipe(z.string().regex(SLUG_PATTERN, "Adresse invalide : de 3 à 48 caractères, lettres minuscules, chiffres et tirets."));

async function editorContext() {
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { ctx, error: forbiddenMessage(ctx, "settings.manage") };
  return { ctx, error: undefined };
}

/** Vide le cache public de l'ancienne et de la nouvelle adresse (changement d'adresse d'un site en ligne). */
function refreshPublic(...slugs: (string | undefined)[]) {
  for (const slug of new Set(slugs.filter(Boolean) as string[])) updateTag(siteCacheTag(slug));
}

export async function saveWebsiteAction(input: { slug: string; brief: string; content: unknown }): Promise<WebsiteActionResult> {
  const { ctx, error } = await editorContext();
  if (error) return { message: error };
  const slug = slugSchema.safeParse(input.slug);
  if (!slug.success) return { message: slug.error.issues[0]?.message ?? "Adresse invalide.", fieldErrors: { slug: [slug.error.issues[0]?.message ?? ""] } };
  const brief = String(input.brief ?? "").slice(0, 6000);
  // Numéros au format international (indicatif du pays de l'agence) : le bouton WhatsApp du site fonctionne toujours.
  const content = withInternationalPhones(normalizeContent(input.content), ctx.agency.countryCode);
  const before = await loadWebsiteRow(ctx);
  const { error: dbError } = await ctx.supabase.rpc("save_agency_website", { p_org: ctx.organizationId, p_slug: slug.data, p_brief: brief, p_draft: content });
  if (dbError) return { message: dbMessage(dbError), fieldErrors: /adresse/i.test(dbError.message) ? { slug: [dbMessage(dbError)] } : undefined };
  // Adresse changée alors que le site est en ligne : l'ancienne adresse ne doit plus servir la page.
  if (before?.isOnline && before.slug !== slug.data) refreshPublic(before.slug);
  return { ok: true, message: "Brouillon enregistré. Il sera visible en ligne à la prochaine publication.", content, slug: slug.data };
}

export async function generateWebsiteAction(input: { slug: string; brief: string; content: unknown }): Promise<WebsiteActionResult> {
  const { ctx, error } = await editorContext();
  if (error) return { message: error };
  const brief = String(input.brief ?? "").trim();
  if (brief.length < 80) {
    return {
      message: "Décrivez votre agence en quelques phrases (80 caractères au moins) : services, destinations, public, ville, coordonnées.",
      fieldErrors: { brief: ["Description trop courte."] },
    };
  }
  // On garde la description et l'adresse avant d'appeler l'IA (la limite quotidienne est comptée dans la base).
  const saved = await saveWebsiteAction(input);
  if (!saved.ok) return saved;
  const { error: limitError } = await ctx.supabase.rpc("note_website_generation", { p_org: ctx.organizationId });
  if (limitError) return { message: dbMessage(limitError) };
  try {
    const generated = await generateSiteContent(brief, await agencyFacts(ctx), normalizeContent(input.content));
    const content = withInternationalPhones(generated, ctx.agency.countryCode);
    const { error: dbError } = await ctx.supabase.rpc("save_agency_website", {
      p_org: ctx.organizationId,
      p_slug: saved.slug ?? finalizeSlug(String(input.slug)),
      p_brief: brief,
      p_draft: content,
    });
    if (dbError) return { message: dbMessage(dbError) };
    return {
      ok: true,
      message: "Le site a été rédigé à partir de votre description. Relisez chaque section, modifiez ce qui doit l'être, puis publiez.",
      content,
    };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { message: e.message };
    console.error("[Site web] Rédaction impossible :", e);
    return { message: "La rédaction par l'IA a échoué. Réessayez dans un instant, ou modifiez le texte à la main." };
  }
}

export async function publishWebsiteAction(): Promise<WebsiteActionResult> {
  const { ctx, error } = await editorContext();
  if (error) return { message: error };
  const row = await loadWebsiteRow(ctx);
  if (!row?.draft) return { message: "Enregistrez d'abord le contenu du site." };
  const missing = missingForPublication(row.draft);
  if (missing.length) return { message: `Avant de publier, ajoutez ${missing.join(", ")}.` };
  const { data, error: dbError } = await ctx.supabase.rpc("publish_agency_website", { p_org: ctx.organizationId });
  if (dbError) return { message: dbMessage(dbError) };
  refreshPublic(String(data));
  return { ok: true, message: "Site publié : il est en ligne à son adresse." };
}

export async function unpublishWebsiteAction(): Promise<WebsiteActionResult> {
  const { ctx, error } = await editorContext();
  if (error) return { message: error };
  const row = await loadWebsiteRow(ctx);
  const { error: dbError } = await ctx.supabase.rpc("unpublish_agency_website", { p_org: ctx.organizationId });
  if (dbError) return { message: dbMessage(dbError) };
  refreshPublic(row?.slug);
  return { ok: true, message: "Site mis hors ligne. Le brouillon est conservé : vous pouvez le republier à tout moment." };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Logo ou photo d'accueil : bucket public des sites, dans le dossier de l'agence. */
export async function uploadWebsiteImageAction(formData: FormData): Promise<WebsiteActionResult> {
  const { ctx, error } = await editorContext();
  if (error) return { message: error };
  const kind = formData.get("kind") === "logo" ? "logo" : "hero";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choisissez une image." };
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return { message: "Format non accepté : JPEG, PNG ou WebP." };
  if (file.size > 3 * 1024 * 1024) return { message: "Image trop lourde : 3 Mo au plus." };
  const path = `${ctx.organizationId}/${kind}-${crypto.randomUUID()}.${extension}`;
  const storage = ctx.supabase.storage.from("website-assets");
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return { message: `Envoi de l'image impossible : ${uploadError.message}` };
  return { ok: true, url: storage.getPublicUrl(path).data.publicUrl, message: kind === "logo" ? "Logo ajouté." : "Photo d'accueil ajoutée." };
}

// Formulaire de contact du site (visiteurs sans compte) --------------------------------------------------------

const leadSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN),
  firstName: z.string().trim().min(1, "Indiquez votre prénom.").max(80),
  lastName: z.string().trim().min(1, "Indiquez votre nom.").max(80),
  phone: z
    .string()
    .trim()
    .min(1, "Indiquez votre numéro de téléphone ou WhatsApp.")
    .min(6, "Numéro trop court : indiquez le numéro complet, avec l'indicatif du pays si vous êtes à l'étranger.")
    .max(40, "Numéro trop long."),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]).optional(),
  service: z.string().trim().max(120).optional(),
  destination: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1500, "Message trop long (1 500 caractères au plus).").optional(),
  consent: z.literal("on", { error: "Cochez la case pour que l'agence puisse vous recontacter." }),
  bureauId: z.union([z.literal(""), z.uuid()]).optional(),
});

export async function submitWebsiteLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  // Champ invisible rempli par les robots : on répond comme si tout allait bien, sans rien enregistrer.
  if (values.website) return { ok: true, message: "Merci ! Votre demande a bien été reçue." };
  const parsed = leadSchema.safeParse(values);
  if (!parsed.success) {
    return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const input = parsed.data;
  const site = await getPublicSite(input.slug);
  if (!site) return { message: "Ce site n'est plus disponible.", values };
  const phone = toE164(input.phone, site.countryCode);
  if (!phone) return { message: "Certains champs sont à corriger.", fieldErrors: { phone: ["Numéro invalide : indiquez-le avec l'indicatif du pays (+…)."] }, values };
  const { error } = await createSystemClient().rpc("website_submit_lead", {
    p_slug: input.slug,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: phone,
    p_email: input.email ?? "",
    p_service: input.service ?? "",
    p_destination: input.destination ?? "",
    p_message: input.message ?? "",
    // « Projet » de la fiche prospect, d'après le service choisi.
    p_service_motive: serviceMotive(input.service ?? "") ?? null,
    // Bureau choisi par le visiteur (la base vérifie qu'il appartient à l'agence).
    p_bureau_id: input.bureauId || null,
  });
  if (error) return { message: dbMessage(error), values };
  return { ok: true, message: `Merci ! Votre demande a bien été reçue par ${site.content.agencyName} : un conseiller vous recontacte rapidement.` };
}

/** « Messages reçus » : marque un message du site comme traité, ou le remet à traiter. */
export async function setWebsiteMessageHandledAction(messageId: string, handled: boolean): Promise<FormState> {
  if (!z.uuid().safeParse(messageId).success) return { message: "Message introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { error } = await ctx.supabase.rpc("set_website_message_handled", { p_id: messageId, p_handled: handled });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: handled ? "Message marqué comme traité." : "Message remis à traiter." };
}

/** « Messages reçus » : supprime les messages cochés (la fiche prospect et la tâche « Rappeler » restent). */
export async function deleteWebsiteMessagesAction(messageIds: string[]): Promise<FormState> {
  const ids = [...new Set(messageIds)];
  if (ids.length === 0) return { message: "Cochez au moins un message." };
  if (!ids.every((id) => z.uuid().safeParse(id).success)) return { message: "Message introuvable." };
  if (ids.length > 10000) return { message: "Trop de messages à la fois : cochez-en 10 000 au plus." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  // Toute la sélection, par paquets de 500 (la base en accepte 500 par appel ; « Tout cocher » peut en cocher plus).
  let count = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await ctx.supabase.rpc("delete_website_messages", { p_ids: chunk });
    if (error) {
      if (count > 0) refresh();
      return { message: count > 0 ? `${count} message(s) supprimé(s), puis : ${dbMessage(error)}` : dbMessage(error) };
    }
    count += typeof data === "number" ? data : chunk.length;
  }
  refresh();
  return { ok: true, message: count > 1 ? `${count} messages supprimés.` : "Message supprimé." };
}
