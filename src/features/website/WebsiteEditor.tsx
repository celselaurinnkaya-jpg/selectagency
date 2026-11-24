"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Globe, ImagePlus, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormMessage } from "@/components/shared/form";
import { Card, Notice, Section, StatusBadge } from "@/components/shared/ui";
import {
  contrastRatio,
  defaultContent,
  readableOn,
  SECTION_LABELS,
  TEMPLATES,
  TEMPLATE_KEYS,
  type AgencyFacts,
  type SiteContent,
  type TemplateKey,
} from "./content";
import { generateWebsiteAction, publishWebsiteAction, saveWebsiteAction, unpublishWebsiteAction, uploadWebsiteImageAction, type WebsiteActionResult } from "./actions";

// Éditeur du site de l'agence : modèle, description pour l'IA, contenu section par section, identité visuelle,
// adresse ; puis enregistrer, voir l'aperçu et publier. Rien n'est en ligne avant « Publier ».

const STOCK_PHOTOS = [
  { src: "/images/voyage-sur-mesure.jpg", label: "Voyage" },
  { src: "/images/etudes-etranger.jpg", label: "Études" },
  { src: "/images/visa-tourisme.jpg", label: "Tourisme" },
  { src: "/images/voyage-affaires.jpg", label: "Affaires" },
  { src: "/images/hero-consultant.jpg", label: "Conseil" },
  { src: "/images/autre-mobilite.jpg", label: "Mobilité" },
];

type ListKey = "services" | "destinations" | "steps" | "why" | "testimonials" | "faq";
type Field = { key: string; label: string; multiline?: boolean; max: number };

const LIST_FIELDS: Record<ListKey, { fields: Field[]; max: number; empty: Record<string, string> }> = {
  services: { max: 8, fields: [{ key: "name", label: "Nom du service", max: 80 }, { key: "description", label: "Description", multiline: true, max: 300 }], empty: { name: "", description: "" } },
  destinations: { max: 8, fields: [{ key: "name", label: "Destination", max: 80 }, { key: "description", label: "Description", multiline: true, max: 240 }], empty: { name: "", description: "" } },
  steps: { max: 6, fields: [{ key: "title", label: "Étape", max: 80 }, { key: "text", label: "Explication", multiline: true, max: 240 }], empty: { title: "", text: "" } },
  why: { max: 6, fields: [{ key: "title", label: "Atout", max: 80 }, { key: "text", label: "Explication", multiline: true, max: 240 }], empty: { title: "", text: "" } },
  testimonials: { max: 6, fields: [{ key: "name", label: "Nom du client", max: 80 }, { key: "text", label: "Son avis (réel)", multiline: true, max: 400 }], empty: { name: "", text: "" } },
  faq: { max: 8, fields: [{ key: "question", label: "Question", max: 160 }, { key: "answer", label: "Réponse", multiline: true, max: 600 }], empty: { question: "", answer: "" } },
};

const LIST_ORDER: ListKey[] = ["services", "destinations", "steps", "why", "testimonials", "faq"];

export function WebsiteEditor({
  initial,
  siteBase,
  aiConfigured,
  facts,
}: {
  initial: { slug: string; brief: string; content: SiteContent; saved: boolean; isOnline: boolean; publishedAt?: string; hasUnpublishedChanges: boolean };
  siteBase: string;
  aiConfigured: boolean;
  facts: AgencyFacts;
}) {
  const [slug, setSlug] = useState(initial.slug);
  const [brief, setBrief] = useState(initial.brief);
  const [content, setContent] = useState<SiteContent>(initial.content);
  const [dirty, setDirty] = useState(!initial.saved);
  const [isOnline, setIsOnline] = useState(initial.isOnline);
  const [pendingPublish, setPendingPublish] = useState(initial.hasUnpublishedChanges);
  const [result, setResult] = useState<WebsiteActionResult>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Modifications non enregistrées : le navigateur prévient avant de quitter la page.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (next: SiteContent) => {
    setContent(next);
    setDirty(true);
  };
  const set = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) => update({ ...content, [key]: value });

  const run = (label: string, task: () => Promise<WebsiteActionResult>, after?: (r: WebsiteActionResult) => void) => {
    setBusy(label);
    startTransition(async () => {
      const r = await task();
      setResult(r);
      if (r.ok) after?.(r);
      setBusy(null);
    });
  };

  const save = (after?: () => void) =>
    run("save", () => saveWebsiteAction({ slug, brief, content }), (r) => {
      if (r.content) setContent(r.content);
      setDirty(false);
      if (isOnline) setPendingPublish(true);
      after?.();
    });

  const generate = () =>
    run("ai", () => generateWebsiteAction({ slug, brief, content }), (r) => {
      if (r.content) setContent(r.content);
      setDirty(false);
      if (isOnline) setPendingPublish(true);
    });

  const publish = () =>
    run(
      "publish",
      async () => {
        if (dirty) {
          const saved = await saveWebsiteAction({ slug, brief, content });
          if (!saved.ok) return saved;
        }
        return publishWebsiteAction();
      },
      () => {
        setDirty(false);
        setIsOnline(true);
        setPendingPublish(false);
      },
    );

  const unpublish = () => {
    if (!confirm("Mettre le site hors ligne ? Les visiteurs ne le verront plus ; le brouillon est conservé.")) return;
    run("unpublish", () => unpublishWebsiteAction(), () => setIsOnline(false));
  };

  const chooseTemplate = (key: TemplateKey) => {
    const previous = TEMPLATES[content.template];
    const next = TEMPLATES[key];
    // Couleurs et photo encore celles du modèle précédent : elles suivent le nouveau modèle.
    const sameColors = content.colors.primary === previous.colors.primary && content.colors.accent === previous.colors.accent;
    const sameHero = !content.heroImageUrl || content.heroImageUrl === previous.heroImage;
    update({ ...content, template: key, colors: sameColors ? next.colors : content.colors, heroImageUrl: sameHero ? next.heroImage : content.heroImageUrl });
  };

  const resetFromTemplate = () => {
    if (!confirm("Remplacer tout le contenu par le texte d'exemple du modèle ? Vos modifications non publiées seront perdues.")) return;
    const fresh = defaultContent(content.template, facts);
    update({ ...fresh, colors: content.colors, logoUrl: content.logoUrl, heroImageUrl: content.heroImageUrl || fresh.heroImageUrl });
  };

  const upload = (kind: "logo" | "hero", file: File | undefined) => {
    if (!file) return;
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    run(kind, () => uploadWebsiteImageAction(data), (r) => {
      if (!r.url) return;
      const next = kind === "logo" ? { ...content, logoUrl: r.url } : { ...content, heroImageUrl: r.url };
      setContent(next);
      // L'image est enregistrée tout de suite dans le brouillon.
      startTransition(async () => {
        const saved = await saveWebsiteAction({ slug, brief, content: next });
        setResult(saved.ok ? { ok: true, message: `${r.message} Brouillon enregistré.` } : saved);
        if (saved.ok) {
          setDirty(false);
          if (isOnline) setPendingPublish(true);
        }
      });
    });
  };

  const url = `${siteBase}${slug}`;
  const contrastPrimary = contrastRatio(content.colors.primary, readableOn(content.colors.primary));
  const contrastAccent = contrastRatio(content.colors.accent, readableOn(content.colors.accent));
  const slugError = result.fieldErrors?.slug?.[0];

  return (
    <div className="space-y-6 pb-24">
      {/* État du site et actions principales */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Globe className="size-5 shrink-0 text-navy-800" aria-hidden />
            <StatusBadge spec={isOnline ? { label: "En ligne", tone: "success" } : { label: initial.publishedAt ? "Hors ligne" : "Pas encore publié", tone: "neutral" }} />
            {isOnline ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-navy-800 underline">
                {url}
              </a>
            ) : (
              <span className="truncate text-sm text-slate-600">{url}</span>
            )}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Copier l'adresse du site"
            >
              {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => save()}>
              {busy === "save" ? "Enregistrement…" : "Enregistrer le brouillon"}
            </Button>
            <Button asChild variant="outline">
              <a href="/apercu-site" target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Aperçu
              </a>
            </Button>
            <Button type="button" variant="accent" disabled={!!busy} onClick={publish}>
              {busy === "publish" ? "Publication…" : isOnline ? "Mettre à jour le site en ligne" : "Publier le site"}
            </Button>
            {isOnline && (
              <Button type="button" variant="ghost" disabled={!!busy} onClick={unpublish} className="text-red-700">
                Mettre hors ligne
              </Button>
            )}
          </div>
        </div>
        {dirty && <p className="text-sm text-orange-800">Modifications non enregistrées. L&apos;aperçu montre le dernier brouillon enregistré.</p>}
        {!dirty && isOnline && pendingPublish && (
          <p className="text-sm text-orange-800">Le brouillon contient des modifications pas encore en ligne : cliquez sur « Mettre à jour le site en ligne ».</p>
        )}
        <FormMessage message={result.message} tone={result.ok ? "success" : "error"} />
      </Card>

      {/* 1. Modèle */}
      <Section title="1. Choisissez un modèle">
        <div role="radiogroup" aria-label="Modèle de page" className="grid gap-3 md:grid-cols-3">
          {TEMPLATE_KEYS.map((key) => {
            const t = TEMPLATES[key];
            const active = content.template === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseTemplate(key)}
                className={`overflow-hidden rounded-xl border bg-white text-left transition ${active ? "border-navy-800 ring-2 ring-navy-200" : "border-slate-200 hover:border-navy-300"}`}
              >
                <span className="flex h-24 items-end gap-2 p-3" style={{ background: t.colors.primary }}>
                  <span className="h-3 w-20 rounded-full bg-white/80" />
                  <span className="h-6 w-16 rounded-md" style={{ background: t.colors.accent }} />
                </span>
                <span className="block p-3">
                  <span className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                    {t.name}
                    {active && <Check className="size-4 text-navy-800" aria-hidden />}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-navy-700">{t.bestFor}</span>
                  <span className="mt-1 block text-sm text-slate-600">{t.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 2. Description pour l'IA */}
      <Section title="2. Décrivez votre agence : l'IA rédige le site">
        <Card className="space-y-3">
          <FormField
            id="site-brief"
            label="Tout ce que l'IA doit savoir sur votre agence"
            error={result.fieldErrors?.brief}
            hint="Vos services, destinations, public (étudiants, familles, entreprises), ville, horaires, coordonnées, ce qui vous distingue, et de vrais avis de clients si vous en avez."
          >
            <Textarea
              id="site-brief"
              rows={9}
              maxLength={6000}
              value={brief}
              onChange={(e) => {
                setBrief(e.target.value);
                setDirty(true);
              }}
              placeholder="Exemple : Presta Services, à Douala depuis 2018, accompagne les étudiants vers la France, la Belgique et le Canada : orientation, admission, visa étudiant, logement. Nous réservons aussi les billets d'avion. Ouvert du lundi au samedi, 8 h – 18 h. Téléphone et WhatsApp : +237 6 99 00 00 00…"
            />
          </FormField>
          <p className="text-xs text-slate-500">
            {brief.length} / 6 000 caractères. L&apos;IA utilise seulement ce texte et la fiche de l&apos;agence : elle n&apos;invente ni prix, ni promesse de
            résultat, ni avis de client. Relisez toujours avant de publier. 20 rédactions par jour au plus.
          </p>
          {!aiConfigured && <Notice tone="warning">L&apos;IA n&apos;est pas encore configurée sur le serveur : vous pouvez partir du modèle et modifier le texte à la main.</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="accent" disabled={!!busy || !aiConfigured} onClick={generate}>
              <Sparkles aria-hidden />
              {busy === "ai" ? "Rédaction en cours… (jusqu'à 30 secondes)" : "Rédiger mon site avec l'IA"}
            </Button>
            <Button type="button" variant="outline" disabled={!!busy} onClick={resetFromTemplate}>
              <Wand2 aria-hidden />
              Repartir du texte d&apos;exemple du modèle
            </Button>
          </div>
        </Card>
      </Section>

      {/* 3. Contenu */}
      <Section title="3. Modifiez le contenu">
        <div className="space-y-3">
          <Card className="space-y-3">
            <h3 className="font-semibold text-navy-800">Accueil</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="site-name" label="Nom de l'agence affiché">
                <Input id="site-name" maxLength={120} value={content.agencyName} onChange={(e) => set("agencyName", e.target.value)} />
              </FormField>
              <FormField id="site-tagline" label="Slogan">
                <Input id="site-tagline" maxLength={140} value={content.tagline} onChange={(e) => set("tagline", e.target.value)} />
              </FormField>
              <FormField id="site-hero-title" label="Grand titre">
                <Input id="site-hero-title" maxLength={120} value={content.hero.title} onChange={(e) => set("hero", { ...content.hero, title: e.target.value })} />
              </FormField>
              <FormField id="site-hero-cta" label="Texte du bouton">
                <Input id="site-hero-cta" maxLength={40} value={content.hero.ctaLabel} onChange={(e) => set("hero", { ...content.hero, ctaLabel: e.target.value })} />
              </FormField>
            </div>
            <FormField id="site-hero-subtitle" label="Phrase d'accroche">
              <Textarea id="site-hero-subtitle" rows={2} maxLength={300} value={content.hero.subtitle} onChange={(e) => set("hero", { ...content.hero, subtitle: e.target.value })} />
            </FormField>
          </Card>

          <details className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
            <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 font-semibold text-navy-800">
              {SECTION_LABELS.about}
              <span className="text-xs font-normal text-slate-500">{content.about.visible ? "affichée" : "masquée"}</span>
            </summary>
            <div className="mt-3 space-y-3">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={content.about.visible} onChange={(e) => set("about", { ...content.about, visible: e.target.checked })} className="size-4 accent-navy-800" />
                Afficher cette section
              </label>
              <FormField id="site-about-title" label="Titre">
                <Input id="site-about-title" maxLength={80} value={content.about.title} onChange={(e) => set("about", { ...content.about, title: e.target.value })} />
              </FormField>
              <FormField id="site-about-text" label="Texte">
                <Textarea id="site-about-text" rows={5} maxLength={1500} value={content.about.text} onChange={(e) => set("about", { ...content.about, text: e.target.value })} />
              </FormField>
            </div>
          </details>

          {LIST_ORDER.map((key) => {
            const spec = LIST_FIELDS[key];
            const section = content[key] as { visible: boolean; title: string; items: Record<string, string>[] };
            const setSection = (next: typeof section) => set(key, next as SiteContent[typeof key]);
            return (
              <details key={key} className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
                <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 font-semibold text-navy-800">
                  {SECTION_LABELS[key]} ({section.items.length})
                  <span className="text-xs font-normal text-slate-500">{section.visible && section.items.length > 0 ? "affichée" : "masquée"}</span>
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" checked={section.visible} onChange={(e) => setSection({ ...section, visible: e.target.checked })} className="size-4 accent-navy-800" />
                    Afficher cette section
                  </label>
                  {key === "testimonials" && (
                    <p className="text-xs text-slate-500">Seulement de vrais avis de clients, avec leur accord. N&apos;en inventez pas.</p>
                  )}
                  <FormField id={`site-${key}-title`} label="Titre de la section">
                    <Input id={`site-${key}-title`} maxLength={80} value={section.title} onChange={(e) => setSection({ ...section, title: e.target.value })} />
                  </FormField>
                  <ol className="space-y-3">
                    {section.items.map((item, index) => (
                      <li key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
                        {spec.fields.map((f) => {
                          const id = `site-${key}-${index}-${f.key}`;
                          const change = (value: string) =>
                            setSection({ ...section, items: section.items.map((it, i) => (i === index ? { ...it, [f.key]: value } : it)) });
                          return (
                            <FormField key={f.key} id={id} label={f.label}>
                              {f.multiline ? (
                                <Textarea id={id} rows={2} maxLength={f.max} value={item[f.key] ?? ""} onChange={(e) => change(e.target.value)} />
                              ) : (
                                <Input id={id} maxLength={f.max} value={item[f.key] ?? ""} onChange={(e) => change(e.target.value)} />
                              )}
                            </FormField>
                          );
                        })}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-700"
                          onClick={() => setSection({ ...section, items: section.items.filter((_, i) => i !== index) })}
                        >
                          <Trash2 aria-hidden />
                          Retirer
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {section.items.length < spec.max && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setSection({ ...section, visible: true, items: [...section.items, { ...spec.empty }] })}>
                      <Plus aria-hidden />
                      Ajouter
                    </Button>
                  )}
                </div>
              </details>
            );
          })}

          <Card className="space-y-3">
            <h3 className="font-semibold text-navy-800">Contact</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["title", "Titre", 80],
                  ["phone", "Téléphone", 40],
                  ["whatsapp", "WhatsApp (bouton vert du site)", 40],
                  ["email", "E-mail", 254],
                  ["address", "Adresse", 200],
                  ["hours", "Horaires", 120],
                ] as [keyof SiteContent["contact"], string, number][]
              ).map(([k, label, max]) => (
                <FormField key={k} id={`site-contact-${k}`} label={label}>
                  <Input id={`site-contact-${k}`} maxLength={max} value={content.contact[k]} onChange={(e) => set("contact", { ...content.contact, [k]: e.target.value })} />
                </FormField>
              ))}
            </div>
            <FormField id="site-contact-text" label="Phrase au-dessus du formulaire">
              <Textarea id="site-contact-text" rows={2} maxLength={300} value={content.contact.text} onChange={(e) => set("contact", { ...content.contact, text: e.target.value })} />
            </FormField>
            <FormField id="site-seo" label="Résumé pour Google (160 caractères)" hint="Le texte affiché sous le nom de votre site dans les résultats de recherche.">
              <Input id="site-seo" maxLength={160} value={content.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} />
            </FormField>
          </Card>
        </div>
      </Section>

      {/* 4. Identité visuelle */}
      <Section title="4. Logo, photo et couleurs">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-4">
            <div>
              <p className="mb-2 font-semibold text-navy-800">Logo</p>
              <div className="flex flex-wrap items-center gap-3">
                {content.logoUrl ? (
                  <img src={content.logoUrl} alt="Logo actuel" className="h-14 w-auto max-w-40 rounded border border-slate-200 bg-white object-contain p-1" />
                ) : (
                  <span className="text-sm text-slate-500">Aucun logo : le nom de l&apos;agence s&apos;affiche seul.</span>
                )}
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-navy-800 hover:border-navy-300">
                  <ImagePlus className="size-4" aria-hidden />
                  {busy === "logo" ? "Envoi…" : "Choisir un logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => upload("logo", e.target.files?.[0])} />
                </label>
                {content.logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("logoUrl", "")}>
                    Retirer
                  </Button>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 font-semibold text-navy-800">Photo d&apos;accueil</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {STOCK_PHOTOS.map((p) => (
                  <button
                    key={p.src}
                    type="button"
                    onClick={() => set("heroImageUrl", p.src)}
                    aria-pressed={content.heroImageUrl === p.src}
                    className={`overflow-hidden rounded-lg border-2 ${content.heroImageUrl === p.src ? "border-navy-800" : "border-transparent"}`}
                  >
                    <img src={p.src} alt={p.label} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-navy-800 hover:border-navy-300">
                  <ImagePlus className="size-4" aria-hidden />
                  {busy === "hero" ? "Envoi…" : "Utiliser ma propre photo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => upload("hero", e.target.files?.[0])} />
                </label>
                {content.heroImageUrl.startsWith("https://") && <span className="text-xs text-slate-500">Photo personnelle utilisée.</span>}
              </div>
              <p className="mt-1 text-xs text-slate-500">JPEG, PNG ou WebP, 3 Mo au plus. Utilisez seulement des photos dont vous avez les droits.</p>
            </div>
          </Card>
          <Card className="space-y-4">
            {(
              [
                ["primary", "Couleur principale", contrastPrimary],
                ["accent", "Couleur des boutons", contrastAccent],
              ] as ["primary" | "accent", string, number][]
            ).map(([k, label, ratio]) => (
              <div key={k}>
                <p className="mb-2 font-semibold text-navy-800">{label}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={content.colors[k]}
                    onChange={(e) => set("colors", { ...content.colors, [k]: e.target.value.toUpperCase() })}
                    aria-label={label}
                    className="h-11 w-14 cursor-pointer rounded border border-slate-300 bg-white"
                  />
                  <Input
                    value={content.colors[k]}
                    maxLength={7}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) set("colors", { ...content.colors, [k]: v.toUpperCase() });
                    }}
                    className="w-28 font-mono"
                    aria-label={`${label} (code)`}
                  />
                  <span className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: content.colors[k], color: readableOn(content.colors[k]) }}>
                    Exemple de texte
                  </span>
                </div>
                {ratio < 4.5 && <p className="mt-1 text-xs text-orange-800">Contraste faible : le texte sur cette couleur sera peu lisible. Choisissez une couleur plus foncée ou plus claire.</p>}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set("colors", TEMPLATES[content.template].colors)}
            >
              Reprendre les couleurs du modèle
            </Button>
          </Card>
        </div>
      </Section>

      {/* 5. Adresse */}
      <Section title="5. Adresse du site">
        <Card className="space-y-2">
          <FormField id="site-slug" label="Adresse" error={slugError ? [slugError] : undefined} hint="Lettres minuscules, chiffres et tirets. Si vous la changez, l'ancienne adresse ne fonctionnera plus.">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
              <span className="text-sm text-slate-600">{siteBase}</span>
              <Input
                id="site-slug"
                value={slug}
                maxLength={48}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  setDirty(true);
                }}
                className="sm:max-w-xs"
              />
            </div>
          </FormField>
        </Card>
      </Section>

      {/* Barre d'actions toujours visible */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-slate-600">{dirty ? "Modifications non enregistrées" : isOnline ? "Brouillon enregistré" : "Brouillon enregistré, pas encore publié"}</span>
          <Button type="button" variant="outline" disabled={!!busy} onClick={() => save()}>
            {busy === "save" ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button type="button" variant="accent" disabled={!!busy} onClick={publish}>
            {busy === "publish" ? "Publication…" : isOnline ? "Mettre à jour en ligne" : "Publier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
