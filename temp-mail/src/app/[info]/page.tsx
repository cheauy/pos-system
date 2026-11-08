import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INFO_PAGES } from "../../lib/site-content.ts";
import { translations } from "../../lib/i18n.ts";
import { pageMetadata } from "../../lib/seo.ts";

export const dynamicParams = false;
export function generateStaticParams() { return INFO_PAGES.map(page => ({ info: page.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ info: string }> }): Promise<Metadata> {
  const { info } = await params;
  const page = INFO_PAGES.find(page => page.slug === info);
  if (!page) notFound();
  return pageMetadata(`${translations.en[page.section]} | Tenh Temp Mail`, page.description, `/${page.slug}`);
}

export default async function InformationPage({ params }: { params: Promise<{ info: string }> }) {
  const { info } = await params;
  const page = INFO_PAGES.find(page => page.slug === info);
  if (!page) notFound();
  return <main className="editorial-container information-page"><Link className="editorial-link" href="/">← Back to Tenh Temp Mail</Link>
    <article className="editorial-card"><h1>{translations.en[page.section]}</h1><p className="updated-date">Last updated November 7, 2026</p>
      <section className="policy-language" lang="en" aria-label="English">{translations.en[`${page.section}Text`].map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>
      <section className="policy-language" lang="km" aria-label="ខ្មែរ"><h2>{translations.km[page.section]}</h2>{translations.km[`${page.section}Text`].map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>
      {(page.section === "contact" || page.section === "abuse") && <a className="editorial-link" href="mailto:support@tenh-pos.com">support@tenh-pos.com</a>}
      {page.section === "privacy" && <nav className="policy-links" aria-label="Advertising privacy resources"><a href="https://adsterra.com/privacy-policy-managed/" rel="external">Adsterra privacy policy</a></nav>}
      {(page.section === "terms" || page.section === "contact") && <nav className="policy-links" aria-label="Related help and policies">{INFO_PAGES.filter(related => related.slug !== info).map(related => <Link href={`/${related.slug}`} key={related.slug}>{translations.en[related.section]} · <span lang="km">{translations.km[related.section]}</span></Link>)}<Link href="/guides/disposable-email-testing">Developer &amp; QA testing guide</Link></nav>}
    </article>
  </main>;
}
