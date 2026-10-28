import Link from "next/link";
import { ArrowLeft, Info, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { LabelSpec, Tone } from "@/lib/domain/labels";

// Composants d'affichage partagés par toutes les pages.

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 space-y-3">
      {back && (
        <Link href={back.href} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-navy-800">
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow}
          <h1 className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-slate-600 sm:text-base">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Titre de section : bleu marine souligné d'un trait jaune, comme « Agency » dans le logo. */
export function SectionTitle({ children, as: Tag = "h2", className }: { children: React.ReactNode; as?: "h2" | "h3"; className?: string }) {
  return (
    <Tag className={cn("relative pb-2 text-lg font-semibold text-navy-800 sm:text-xl", className)}>
      {children}
      <span aria-hidden className="absolute bottom-0 left-0 h-1.5 w-12 rounded-full border border-citron-600 bg-citron-400" />
    </Tag>
  );
}

/** Panneau gris arrondi qui regroupe une section (référence UNIP). */
export function Section({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 rounded-2xl bg-surface p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          {title && <SectionTitle>{title}</SectionTitle>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]", className)}>{children}</div>;
}

const TONES: Record<Tone, string> = {
  navy: "border-navy-200 bg-navy-50 text-navy-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-orange-200 bg-orange-50 text-orange-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  external: "border-violet-200 bg-violet-50 text-violet-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

const DOTS: Record<Tone, string> = {
  navy: "bg-navy-700",
  success: "bg-emerald-600",
  warning: "bg-orange-500",
  danger: "bg-red-600",
  info: "bg-sky-600",
  external: "bg-violet-600",
  neutral: "bg-slate-400",
};

export function StatusBadge({ spec, icon: Icon, className }: { spec: LabelSpec; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", TONES[spec.tone], className)}>
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOTS[spec.tone])} />}
      <span className="truncate">{spec.label}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "navy",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "navy" | "warning" | "danger" | "success";
}) {
  const valueColor = { navy: "text-navy-800", warning: "text-orange-700", danger: "text-red-700", success: "text-emerald-700" }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", valueColor)}>{value}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const classes = "block rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]";
  return href ? (
    <Link href={href} className={cn(classes, "transition hover:ring-2 hover:ring-navy-200")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** Tuile d'accès rapide (référence UNIP). La variante `highlight` reprend la tuile mise en avant. */
export function Tile({ href, label, icon: Icon, highlight = false, badge }: { href: string; label: string; icon: LucideIcon; highlight?: boolean; badge?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-24 flex-col justify-between gap-3 rounded-xl p-4 text-sm font-medium shadow-[0_1px_3px_rgba(2,55,100,0.12)] transition",
        highlight
          ? "bg-linear-to-br from-navy-800 to-navy-600 text-white hover:brightness-110"
          : "bg-white text-slate-800 hover:ring-2 hover:ring-navy-200",
      )}
    >
      <Icon className={cn("size-6", highlight ? "text-citron-400" : "text-navy-700")} aria-hidden />
      <span>{label}</span>
      {badge && (
        <span className="absolute top-3 right-3 rounded-full bg-citron-400 px-2 py-0.5 text-xs font-semibold text-navy-900">{badge}</span>
      )}
    </Link>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="mt-3 font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ children, tone = "info", title }: { children: React.ReactNode; tone?: "info" | "success" | "warning"; title?: string }) {
  const styles = {
    info: "border-navy-200 bg-navy-50 text-navy-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-orange-200 bg-orange-50 text-orange-900",
  }[tone];
  return (
    <div role={tone === "success" ? "status" : "note"} className={cn("flex gap-2.5 rounded-xl border px-4 py-3 text-sm", styles)}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Action qui n'est pas encore disponible : bouton désactivé avec l'explication visible. */
export function PlannedAction({ label, reason, icon: Icon }: { label: string; reason: string; icon?: LucideIcon }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled
        className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-slate-500"
      >
        {Icon && <Icon className="size-4" aria-hidden />}
        {label}
      </button>
      <span className="text-xs text-slate-500">{reason}</span>
    </span>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
