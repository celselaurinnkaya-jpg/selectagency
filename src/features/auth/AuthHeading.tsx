import { Notice } from "@/components/shared/ui";
import { isSupabaseConfigured } from "@/lib/env";

/** Titre des pages de compte, avec le soulignement jaune signature des titres de section. */
export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="relative pb-3 text-2xl font-semibold text-navy-800">
        {title}
        <span aria-hidden className="absolute bottom-0 left-0 h-1.5 w-12 rounded-full border border-citron-600 bg-citron-400" />
      </h1>
      {description && <p className="mt-3 text-sm text-slate-600">{description}</p>}
      {!isSupabaseConfigured() && (
        <div className="mt-4">
          <Notice tone="warning" title="Base de données non configurée">
            Copiez le fichier .env.example en .env.local, indiquez l&apos;URL et la clé publique de votre projet Supabase, puis
            redémarrez le serveur (npm run dev).
          </Notice>
        </div>
      )}
    </div>
  );
}
