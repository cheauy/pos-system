import Link from "next/link";
import { GUIDE_SECTIONS } from "../../../lib/site-content.ts";
import { pageMetadata } from "../../../lib/seo.ts";

export const metadata = pageMetadata("Disposable Email for Developer & QA Testing | Tenh Temp Mail", "A practical checklist for authorized disposable email testing: isolate fixtures, verify OTPs, diagnose delivery and protect customer data.", "/guides/disposable-email-testing");

export default function TestingGuide() {
  return <main className="editorial-container information-page" lang="en"><Link className="editorial-link" href="/">← Back to Tenh Temp Mail</Link>
    <header className="editorial-intro"><span className="eyebrow">Developer &amp; QA guide</span><h1>Test email verification without mixing up your fixtures</h1><p>A checklist for low-volume, authorized disposable email tests. Written for developers, QA engineers and product teams.</p><p className="updated-date">Updated November 7, 2026 · Tenh Temp Mail</p></header>
    <article className="editorial-card">{GUIDE_SECTIONS.map(section => <section className="prose-section" key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</article>
  </main>;
}
