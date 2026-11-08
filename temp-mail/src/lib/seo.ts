import type { Metadata } from "next";
import { SITE_URL } from "./config.ts";
import { HOME_FAQS } from "./site-content.ts";

export const SEO_TITLE = "Tenh Temp Mail | Free Temp Mail & Receive OTP Online";
export const DESCRIPTION_EN = "Free temp mail in Cambodia to receive OTP online. A disposable email and 10 minute mail alternative with public inboxes and 60-minute message expiry.";
export const DESCRIPTION_KM = "បង្កើតអ៊ីមែលបណ្តោះអាសន្នដោយឥតគិតថ្លៃ និងអ៊ីមែលទទួលកូដ OTP។ ប្រអប់សារសាធារណៈ ផុតកំណត់ក្រោយ ៦០ នាទី។";

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, SITE_URL).href;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "Tenh Temp Mail", locale: "en_US", alternateLocale: ["km_KH"],
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: "Tenh Temp Mail — free temporary email and OTP inbox" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/opengraph-image`] },
  };
}

export const webApplicationSchema = {
  "@context": "https://schema.org", "@type": "WebApplication", "@id": `${SITE_URL}/#application`,
  name: "Tenh Temp Mail", url: `${SITE_URL}/`, description: DESCRIPTION_EN,
  applicationCategory: "UtilitiesApplication", operatingSystem: "Any", inLanguage: ["en", "km"],
  browserRequirements: "Requires JavaScript for the live inbox. Educational content is available without JavaScript.",
  isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: ["Disposable email", "Receive OTP online", "Automated QA testing", "60-minute message expiry", "Khmer and English interface"],
};

export const webSiteSchema = {
  "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#website`,
  name: "Tenh Temp Mail", alternateName: ["TenhMail", new URL(SITE_URL).hostname],
  url: `${SITE_URL}/`, inLanguage: ["en", "km"],
};

export const faqPageSchema = {
  "@context": "https://schema.org", "@type": "FAQPage", inLanguage: "en",
  mainEntity: HOME_FAQS.map(faq => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
};
