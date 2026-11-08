"use client";

import DOMPurify from "isomorphic-dompurify";
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import type { EmailMessage } from "../lib/config.ts";
import { translations, type Language } from "../lib/i18n.ts";

export default function EmailReader({ email, language, onCopy, copied }: {
  email: EmailMessage; language: Language;
  onCopy: (value: string) => void; copied: string;
}) {
  const t = translations[language];
  const html = DOMPurify.sanitize(email.html, {
    ALLOWED_TAGS: ["p", "br", "div", "span", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "blockquote", "pre", "code", "hr"],
    ALLOWED_ATTR: [],
  });
  return (
    <section className="reader">
      <div className="reader-topline"><ShieldCheck size={14} /><span>{t.messagePreview}</span></div>
      <h2>{email.subject || t.noSubject}</h2>
      <dl className="message-meta">
        <div><dt>{t.from}</dt><dd>{email.sender}</dd></div>
        <div><dt>{t.to}</dt><dd>{email.recipient}</dd></div>
        <div><dt>{t.received}</dt><dd>{new Date(email.timestamp).toLocaleString(language === "km" ? "km-KH" : "en-US")}</dd></div>
      </dl>
      {email.otp_code && <div className="otp-banner"><span className="otp-icon"><KeyRound size={23} /></span><div><span>{t.otpReady}</span><strong>{email.otp_code}</strong></div>
        <button className="otp-button" onClick={() => onCopy(email.otp_code!)}>{copied === email.otp_code ? <Check size={16} /> : <Copy size={16} />}{copied === email.otp_code ? t.copied : t.otp}</button>
      </div>}
      {html ? <div className="email-content" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="email-content plain-text">{email.text}</div>}
    </section>
  );
}
