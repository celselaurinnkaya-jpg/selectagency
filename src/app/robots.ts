import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

// Moteurs de recherche : le site de SELECT et les sites publiés des agences ; jamais l'aperçu ni l'API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/site/"], disallow: ["/api/", "/admin", "/apercu-site", "/acces-client/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
