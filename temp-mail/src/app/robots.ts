import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/config.ts";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/ads/"] }, sitemap: `${SITE_URL}/sitemap.xml` };
}
