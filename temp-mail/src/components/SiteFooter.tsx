import Link from "next/link";
import { INFO_PAGES } from "../lib/site-content.ts";
import { translations } from "../lib/i18n.ts";

export default function SiteFooter() {
  return <footer className="site-footer editorial-footer" lang="en"><Link className="footer-brand" href="/">Tenh Temp Mail · A temporary inbox. A little more peace of mind.</Link>
    <nav aria-label="Site information">{INFO_PAGES.map(page => <Link href={`/${page.slug}`} key={page.slug}><span>{translations.en[page.section]}</span><span lang="km">{translations.km[page.section]}</span></Link>)}<Link href="/guides/disposable-email-testing">Developer &amp; QA guide</Link><Link href="/gemini"><span>Gemini guide</span><span lang="km">ការណែនាំ Gemini</span></Link></nav>
    <span className="footer-domain">temp-mail.tenh-pos.com</span>
  </footer>;
}
