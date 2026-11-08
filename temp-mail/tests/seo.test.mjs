import test from "node:test";
import assert from "node:assert/strict";
import { HOME_SECTIONS, HOME_FAQS, GUIDE_SECTIONS, INFO_PAGES } from "../src/lib/site-content.ts";
import { DESCRIPTION_EN, DESCRIPTION_KM, faqPageSchema, pageMetadata, SEO_TITLE, webApplicationSchema, webSiteSchema } from "../src/lib/seo.ts";
import { HOME_FAQS_KM, HOME_SECTIONS_KM } from "../src/lib/site-content-km.ts";
import { translations } from "../src/lib/i18n.ts";
import { SITE_URL } from "../src/lib/config.ts";
import robots from "../src/app/robots.ts";
import sitemap from "../src/app/sitemap.ts";

test("public content is substantial, bilingual, and consistent with the public inbox's limits", () => {
  const words = sections => sections.flatMap(section => section.paragraphs).join(" ").split(/\s+/).length;
  assert.ok(words(HOME_SECTIONS) >= 600);
  assert.ok(words(GUIDE_SECTIONS) >= 600);
  assert.equal(HOME_FAQS.length, 6);
  assert.equal(new Set(HOME_FAQS.map(faq => faq.question)).size, 6);
  for (const page of INFO_PAGES) for (const language of ["en", "km"]) {
    assert.ok(translations[language][page.section]);
    assert.ok(translations[language][`${page.section}Text`].length > 0);
  }
  assert.match(translations.en.privacyText.join(" "), /temporary storage is necessary/);
  assert.match(translations.en.privacyText.join(" "), /Adsterra/);
  assert.match(HOME_SECTIONS.flatMap(section => section.paragraphs).join(" "), /These inboxes are public/);
  const khmerWords = [...new Intl.Segmenter("km", { granularity: "word" }).segment(HOME_SECTIONS_KM.flatMap(section => section.paragraphs).join(" "))].filter(segment => segment.isWordLike);
  assert.ok(khmerWords.length >= 500);
  assert.equal(HOME_FAQS_KM.length, HOME_FAQS.length);
  assert.deepEqual(faqPageSchema.mainEntity.map(entity => [entity.name, entity.acceptedAnswer.text]), HOME_FAQS.map(faq => [faq.question, faq.answer]));
});

test("canonical metadata and crawl files contain only public, canonical pages", () => {
  const metadata = pageMetadata(SEO_TITLE, `${DESCRIPTION_EN} ${DESCRIPTION_KM}`, "/");
  assert.equal(metadata.alternates.canonical, `${SITE_URL}/`);
  assert.equal(metadata.openGraph.url, `${SITE_URL}/`);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.match(metadata.description, /បង្កើតអ៊ីមែលបណ្តោះអាសន្ន/);
  assert.equal(webApplicationSchema["@type"], "WebApplication");
  assert.equal(webApplicationSchema.offers.price, "0");
  assert.deepEqual(webApplicationSchema.inLanguage, ["en", "km"]);
  assert.equal(webSiteSchema.url, metadata.alternates.canonical);
  assert.equal(webSiteSchema.name, metadata.openGraph.siteName);
  assert.ok(webSiteSchema.alternateName.includes(new URL(SITE_URL).hostname));
  const urls = sitemap().map(entry => entry.url);
  assert.equal(urls.length, 8);
  assert.ok(urls.includes(`${SITE_URL}/gemini`));
  assert.equal(sitemap().find(entry => entry.url === `${SITE_URL}/gemini`).lastModified, "2026-11-08");
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) {
    assert.equal(new URL(url).origin, SITE_URL);
    assert.equal(new URL(url).search, "");
    assert.ok(!url.includes("/api/") && !url.includes("/ads/"));
  }
  for (const page of INFO_PAGES) assert.ok(urls.includes(`${SITE_URL}/${page.slug}`));
  assert.equal(robots().rules.userAgent, "*");
  assert.equal(robots().rules.allow, "/");
  assert.equal(robots().sitemap, `${SITE_URL}/sitemap.xml`);
  assert.deepEqual(robots().rules.disallow, ["/api/", "/ads/"]);
});
