import Link from "next/link";
import { HOME_FAQS, HOME_SECTIONS } from "../lib/site-content.ts";
import { HOME_FAQS_KM, HOME_SECTIONS_KM } from "../lib/site-content-km.ts";

export default function SeoContent() {
  return <section className="editorial-container" aria-labelledby="email-guide-title" lang="en">
    <div className="editorial-intro"><span className="eyebrow">A practical guide to temporary email</span><h2 id="email-guide-title">Free disposable email, with clear limits</h2><p>Receive OTP online, keep short tasks out of your main inbox, and test email flows responsibly.</p></div>
    <div className="editorial-card">{HOME_SECTIONS.map(section => <section className="prose-section" key={section.title}><h3>{section.title}</h3>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
      <Link className="editorial-link" href="/guides/disposable-email-testing">Read the developer &amp; QA testing checklist →</Link>
    </div>
    <section className="editorial-card khmer-summary" lang="km" aria-labelledby="khmer-summary-title"><h2 id="khmer-summary-title">សេវាកម្មបង្កើតអ៊ីមែលបណ្តោះអាសន្នដោយឥតគិតថ្លៃ</h2>
      {HOME_SECTIONS_KM.map(section => <section className="prose-section" key={section.title}><h3>{section.title}</h3>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}
    </section>
    <section className="editorial-card faq-section" aria-labelledby="faq-title"><h2 id="faq-title">Frequently asked questions · <span lang="km">សំណួរដែលសួរញឹកញាប់</span></h2>{HOME_FAQS.map((faq, index) => <details key={faq.question}><summary>{faq.question}<span className="faq-translation" lang="km">{HOME_FAQS_KM[index].question}</span></summary><p>{faq.answer}</p><p lang="km">{HOME_FAQS_KM[index].answer}</p></details>)}</section>
  </section>;
}
