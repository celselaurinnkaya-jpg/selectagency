import type { NextConfig } from "next";

// Protections standard envoyées au navigateur sur toutes les pages (audit de sécurité, étape S5) :
// - interdiction d'afficher le site dans la page d'un autre site (piège au clic) ;
// - pas de devinette du type des fichiers téléchargés ;
// - adresse de provenance réduite quand on quitte le site ;
// - caméra, micro, position et paiement désactivés (l'application n'en a pas besoin) ;
// - formulaires envoyés seulement au site lui-même, aucun plugin, aucune balise <base> étrangère.
// La politique de contenu reste volontairement légère (pas de règle sur les scripts) : une règle stricte
// demanderait des jetons à usage unique sur chaque page et risquerait de casser l'application.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
