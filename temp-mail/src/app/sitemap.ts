import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/config.ts";
import { INFO_PAGES } from "../lib/site-content.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...INFO_PAGES.map(page => `/${page.slug}`), "/guides/disposable-email-testing", "/gemini"].map(path => ({ url: `${SITE_URL}${path}`, lastModified: path === "/gemini" ? "2026-11-08" : "2026-11-07" }));
}
