import { Check, Clock, Mail, MapPin, MessageCircle, Phone, Quote } from "lucide-react";
import { readableOn, whatsappHref, type SectionKey, type SiteContent, type TemplateKey } from "./content";
import { SiteLeadForm } from "./SiteLeadForm";

// Page du site de l'agence, à ses couleurs. Trois mises en page (modèles) pour le même contenu.
// Les couleurs choisies par l'agence passent par des variables CSS ; le texte posé dessus est toujours lisible
// (blanc ou presque noir selon le contraste).

const ORDER: Record<TemplateKey, SectionKey[]> = {
  horizon: ["services", "about", "why", "steps", "destinations", "testimonials", "faq"],
  campus: ["steps", "services", "why", "about", "destinations", "testimonials", "faq"],
  evasion: ["destinations", "services", "about", "why", "steps", "testimonials", "faq"],
};

function SectionTitle({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <h2 className={`mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl ${light ? "text-[var(--on-p)]" : "text-slate-900"}`}>
      {children}
      <span aria-hidden className="mx-auto mt-3 block h-1 w-14 rounded-full bg-[var(--a)]" />
    </h2>
  );
}

function Hero({ c }: { c: SiteContent }) {
  const cta = (
    <a href="#contact" className="inline-flex min-h-12 items-center rounded-xl bg-[var(--a)] px-6 text-base font-semibold text-[var(--on-a)] shadow-md transition hover:brightness-95">
      {c.hero.ctaLabel || "Demander un devis"}
    </a>
  );
  const image = c.heroImageUrl;
  if (c.template === "campus") {
    return (
      <section className="bg-[var(--tint)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            {c.tagline && <p className="mb-3 text-sm font-semibold tracking-wide text-[var(--p)] uppercase">{c.tagline}</p>}
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">{c.hero.title}</h1>
            {c.hero.subtitle && <p className="mt-5 text-lg text-slate-700">{c.hero.subtitle}</p>}
            <div className="mt-8">{cta}</div>
          </div>
          {image && <img src={image} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" />}
        </div>
      </section>
    );
  }
  const centered = c.template === "evasion";
  return (
    <section className={`relative isolate overflow-hidden ${centered ? "rounded-b-[2.5rem]" : ""}`}>
      {image && <img src={image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[var(--p)]" style={{ opacity: image ? 0.72 : 1 }} />
      <div className={`mx-auto max-w-6xl px-4 py-20 sm:py-28 ${centered ? "text-center" : ""}`}>
        <div className={centered ? "mx-auto max-w-3xl" : "max-w-2xl"}>
          {c.tagline && <p className="mb-3 text-sm font-semibold tracking-wide text-[var(--on-p)] uppercase opacity-90">{c.tagline}</p>}
          <h1 className="text-3xl font-bold tracking-tight text-[var(--on-p)] sm:text-5xl">{c.hero.title}</h1>
          {c.hero.subtitle && <p className="mt-5 text-lg text-[var(--on-p)] opacity-90">{c.hero.subtitle}</p>}
          <div className="mt-8">{cta}</div>
        </div>
      </div>
    </section>
  );
}

function Section({ c, k }: { c: SiteContent; k: SectionKey }) {
  const t = c.template;
  if (k === "about") {
    if (!c.about.visible || !c.about.text) return null;
    return (
      <section id="agence" className="mx-auto max-w-3xl px-4 py-16 text-center">
        <SectionTitle>{c.about.title || "Qui sommes-nous"}</SectionTitle>
        <p className="text-lg leading-relaxed whitespace-pre-line text-slate-700">{c.about.text}</p>
      </section>
    );
  }
  if (k === "services") {
    const s = c.services;
    if (!s.visible || s.items.length === 0) return null;
    return (
      <section id="services" className="mx-auto max-w-6xl px-4 py-16">
        <SectionTitle>{s.title || "Nos services"}</SectionTitle>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {s.items.map((item) => (
            <li
              key={item.name}
              className={
                t === "evasion"
                  ? "rounded-3xl bg-[var(--tint)] p-6"
                  : t === "campus"
                    ? "flex gap-3 rounded-2xl border border-slate-200 bg-white p-5"
                    : "rounded-2xl border-t-4 border-[var(--p)] bg-white p-6 shadow-[0_2px_10px_rgba(15,23,42,0.08)]"
              }
            >
              {t === "campus" && (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--p)] text-[var(--on-p)]">
                  <Check className="size-4" aria-hidden />
                </span>
              )}
              <span>
                <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                {item.description && <p className="mt-2 text-slate-600">{item.description}</p>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (k === "destinations") {
    const d = c.destinations;
    if (!d.visible || d.items.length === 0) return null;
    return (
      <section id="destinations" className="bg-[var(--tint)] py-16">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>{d.title || "Destinations"}</SectionTitle>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {d.items.map((item) => (
              <li key={item.name} className={`bg-white p-6 shadow-sm ${t === "evasion" ? "rounded-[2rem]" : "rounded-2xl"}`}>
                <span aria-hidden className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[var(--a)] text-xl font-bold text-[var(--on-a)]">
                  {item.name.charAt(0).toUpperCase()}
                </span>
                <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                {item.description && <p className="mt-2 text-slate-600">{item.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
  if (k === "steps") {
    const s = c.steps;
    if (!s.visible || s.items.length === 0) return null;
    return (
      <section id="etapes" className={`py-16 ${t === "campus" ? "bg-white" : "bg-[var(--tint)]"}`}>
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle>{s.title || "Comment ça marche"}</SectionTitle>
          <ol className="grid gap-6 md:grid-cols-3">
            {s.items.map((item, i) => (
              <li key={`${i}-${item.title}`} className="text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--p)] text-lg font-bold text-[var(--on-p)]">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                {item.text && <p className="mt-2 text-slate-600">{item.text}</p>}
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }
  if (k === "why") {
    const w = c.why;
    if (!w.visible || w.items.length === 0) return null;
    const onPrimary = t !== "campus";
    return (
      <section className={onPrimary ? "bg-[var(--p)] py-16" : "bg-[var(--tint)] py-16"}>
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle light={onPrimary}>{w.title || "Pourquoi nous choisir"}</SectionTitle>
          <ul className="grid gap-6 md:grid-cols-3">
            {w.items.map((item) => (
              <li key={item.title} className={onPrimary ? "rounded-2xl bg-white/10 p-6" : "rounded-2xl bg-white p-6"}>
                <h3 className={`text-lg font-semibold ${onPrimary ? "text-[var(--on-p)]" : "text-slate-900"}`}>{item.title}</h3>
                {item.text && <p className={`mt-2 ${onPrimary ? "text-[var(--on-p)] opacity-90" : "text-slate-600"}`}>{item.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
  if (k === "testimonials") {
    const r = c.testimonials;
    if (!r.visible || r.items.length === 0) return null;
    return (
      <section className="mx-auto max-w-6xl px-4 py-16">
        <SectionTitle>{r.title || "Ils nous ont fait confiance"}</SectionTitle>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {r.items.map((item) => (
            <li key={item.name + item.text.slice(0, 20)} className="rounded-2xl border border-slate-200 bg-white p-6">
              <Quote className="size-6 text-[var(--p)]" aria-hidden />
              <p className="mt-3 text-slate-700">{item.text}</p>
              <p className="mt-4 font-semibold text-slate-900">{item.name}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  const f = c.faq;
  if (!f.visible || f.items.length === 0) return null;
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
      <SectionTitle>{f.title || "Questions fréquentes"}</SectionTitle>
      <ul className="space-y-3">
        {f.items.map((item) => (
          <li key={item.question}>
            <details className="group rounded-2xl border border-slate-200 bg-white p-5">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900">
                {item.question}
                <span aria-hidden className="text-[var(--p)] transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 whitespace-pre-line text-slate-600">{item.answer}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SiteRenderer({
  content: c,
  slug,
  countryCode,
  preview = false,
}: {
  content: SiteContent;
  slug: string;
  /** Pays de l'agence : indicatif ajouté aux numéros saisis sans lui (lien WhatsApp). */
  countryCode: string;
  preview?: boolean;
}) {
  const whatsapp = whatsappHref(c.contact.whatsapp || c.contact.phone, countryCode);
  const style = {
    "--p": c.colors.primary,
    "--on-p": readableOn(c.colors.primary),
    "--a": c.colors.accent,
    "--on-a": readableOn(c.colors.accent),
    "--tint": `color-mix(in srgb, ${c.colors.primary} 7%, white)`,
  } as React.CSSProperties;
  const contactLines = [
    c.contact.phone && { icon: Phone, label: c.contact.phone, href: `tel:${c.contact.phone.replace(/[^\d+]/g, "")}` },
    whatsapp && { icon: MessageCircle, label: `WhatsApp ${c.contact.whatsapp || c.contact.phone}`, href: whatsapp },
    c.contact.email && { icon: Mail, label: c.contact.email, href: `mailto:${c.contact.email}` },
    c.contact.address && { icon: MapPin, label: c.contact.address },
    c.contact.hours && { icon: Clock, label: c.contact.hours },
  ].filter(Boolean) as { icon: typeof Phone; label: string; href?: string }[];

  return (
    <div style={style} className="min-h-dvh bg-white text-slate-800 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="#" className="flex min-w-0 items-center gap-3">
            {c.logoUrl && <img src={c.logoUrl} alt="" className="h-10 w-auto max-w-[8rem] object-contain" />}
            <span className="truncate text-lg font-bold text-slate-900">{c.agencyName}</span>
          </a>
          <nav aria-label="Menu du site" className="flex items-center gap-4 text-sm font-medium">
            {c.services.visible && c.services.items.length > 0 && (
              <a href="#services" className="hidden text-slate-700 hover:text-[var(--p)] sm:inline">
                Services
              </a>
            )}
            {c.faq.visible && c.faq.items.length > 0 && (
              <a href="#faq" className="hidden text-slate-700 hover:text-[var(--p)] md:inline">
                Questions
              </a>
            )}
            <a href="#contact" className="inline-flex min-h-10 items-center rounded-lg bg-[var(--p)] px-4 text-[var(--on-p)] hover:brightness-110">
              Contact
            </a>
          </nav>
        </div>
      </header>

      <main>
        <Hero c={c} />
        {ORDER[c.template].map((k) => (
          <Section key={k} c={c} k={k} />
        ))}

        <section id="contact" className="bg-[var(--tint)] py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{c.contact.title || "Contactez-nous"}</h2>
              {c.contact.text && <p className="mt-3 text-slate-700">{c.contact.text}</p>}
              <ul className="mt-6 space-y-3">
                {contactLines.map((line) => (
                  <li key={line.label} className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--p)] text-[var(--on-p)]">
                      <line.icon className="size-4" aria-hidden />
                    </span>
                    {line.href ? (
                      <a href={line.href} className="pt-1.5 font-medium text-slate-900 hover:underline" target={line.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                        {line.label}
                      </a>
                    ) : (
                      <span className="pt-1.5 text-slate-800">{line.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-[0_2px_16px_rgba(15,23,42,0.08)] sm:p-8 lg:col-span-3">
              <SiteLeadForm
                slug={slug}
                agencyName={c.agencyName}
                services={c.services.items.map((s) => s.name).filter(Boolean)}
                ctaLabel={c.hero.ctaLabel ? `${c.hero.ctaLabel}` : "Envoyer ma demande"}
                preview={preview}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 py-10 text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-base font-semibold text-white">{c.agencyName}</p>
            {c.tagline && <p className="mt-1">{c.tagline}</p>}
            <p className="mt-3 max-w-md text-xs text-slate-400">
              Les informations de ce site sont publiées par {c.agencyName}, qui en est responsable. Les données envoyées par le formulaire servent
              uniquement à vous recontacter.
            </p>
          </div>
          <a href="https://www.myselectagency.com" className="text-xs text-slate-400 hover:text-white" target="_blank" rel="noopener noreferrer">
            Site réalisé avec SELECT Agency
          </a>
        </div>
      </footer>

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Écrire à ${c.agencyName} sur WhatsApp`}
          className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
        >
          <MessageCircle className="size-7" aria-hidden />
        </a>
      )}
    </div>
  );
}
