"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Check, Clock3, Copy, Inbox, KeyRound, Languages, LoaderCircle, Mail, RefreshCw, ShieldCheck, Shuffle, Sparkles, Trash2, Zap } from "lucide-react";
import { EMAIL_TTL, MAIL_DOMAINS, normalizeEmail, type EmailMessage } from "../lib/config.ts";
import { translations, type Language } from "../lib/i18n.ts";
import { fallbackUsername, fetchRealisticUsername } from "../lib/username.ts";
import AdSlot from "./AdSlot";
import Modal from "./Modal";
import DomainStatusPanel from "./DomainStatusPanel";

const EmailReader = dynamic(() => import("./EmailReader"));
const subscribe = () => () => {};
const STORAGE = "tenh-temp-mail:v1:";
const API = "/api/webhook/improvmx";

function readSetting(key: string) {
  try { return localStorage.getItem(STORAGE + key); } catch { return null; }
}

function saveSetting(key: string, value: string) {
  try { localStorage.setItem(STORAGE + key, value); } catch { /* Preferences remain usable when browser storage is blocked. */ }
}

function Workspace() {
  const [initialEmail] = useState(() => {
    const saved = normalizeEmail(readSetting("email"));
    return saved && !/^hello\.[a-f0-9]+@/.test(saved) ? saved : `${fallbackUsername()}@${MAIL_DOMAINS[0]}`;
  });
  const [username, setUsername] = useState(() => initialEmail.split("@")[0]);
  const [domain, setDomain] = useState(() => initialEmail.split("@")[1]);
  const [language, setLanguage] = useState<Language>(() => readSetting("language") === "en" ? "en" : "km");
  const [inbox, setInbox] = useState<{ address: string; emails: EmailMessage[]; ready: boolean | null; now: number }>({ address: "", emails: [], ready: null, now: 0 });
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"error" | "copyError" | null>(null);
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState(false);
  const [modal, setModal] = useState<"delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generationLocked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const foregroundRequest = useRef(false);
  const locked = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = translations[language];
  const email = normalizeEmail(`${username}@${domain}`);
  const emails = inbox.address === email ? inbox.emails.filter((item) => item.timestamp > inbox.now - EMAIL_TTL) : [];
  const selected = emails.find((item) => item.id === selectedId) ?? emails[0];
  const ready = inbox.address === email ? inbox.ready : null;
  const chooseDomain = useCallback((value: string) => { setDomain(value); setSelectedId(""); setNotice(false); }, []);

  useEffect(() => {
    saveSetting("language", language);
  }, [language]);

  useEffect(() => {
    if (email) saveSetting("email", email);
  }, [email]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const refresh = useCallback(async (address: string, background = false) => {
    if (locked.current || (background && foregroundRequest.current)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    foregroundRequest.current = !background;
    if (!background) { setBusy(true); setError(null); }
    try {
      const response = await fetch(`${API}?email=${encodeURIComponent(address)}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Inbox request failed");
      const data = await response.json() as { emails: EmailMessage[]; deliveryReady: boolean };
      if (controller.signal.aborted) return;
      const now = Date.now();
      setInbox({ address, ready: data.deliveryReady, now, emails: data.emails });
    } catch {
      if (!background && !controller.signal.aborted) setError("error");
    } finally {
      if (request.current === controller) {
        foregroundRequest.current = false;
        if (!background) setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!email) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (disposed) return;
      if (!document.hidden && !locked.current) await refresh(email!, true);
      if (!disposed) timer = setTimeout(poll, 4000);
    }
    timer = setTimeout(poll, 250);
    const onVisibility = () => { if (!document.hidden && !locked.current) void refresh(email!, true); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { disposed = true; clearTimeout(timer); request.current?.abort(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [email, refresh]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 2200);
    } catch { setError("copyError"); }
  }

  async function deleteInbox() {
    if (!email || locked.current) return;
    locked.current = true;
    setDeleting(true);
    request.current?.abort();
    try {
      const response = await fetch(`${API}?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setInbox({ address: email, emails: [], ready, now: Date.now() });
      setSelectedId("");
      setNotice(true);
      setError(null);
      setModal(null);
    } catch { setError("error"); }
    finally { locked.current = false; setDeleting(false); setBusy(false); }
  }

  async function freshEmail() {
    if (generationLocked.current) return;
    generationLocked.current = true;
    setGenerating(true);
    try {
      const [name] = await Promise.all([fetchRealisticUsername(), new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
      setUsername(name);
      setSelectedId("");
      setNotice(false);
      setError(null);
    } finally {
      generationLocked.current = false;
      setGenerating(false);
    }
  }

  return (
    <div className="app-shell" lang={language}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Tenh Temp Mail"><span className="brand-mark"><Mail size={22} /></span><span><span className="brand-title"><strong>Tenh<span>Mail</span></strong><span className="otp-ready"><Zap size={10} />OTP READY</span></span><small>{t.tagline}</small></span></Link>
        <nav className="header-menu" aria-label="Main navigation"><Link className="header-menu-link" href="/gemini"><Sparkles size={15} />Gemini</Link></nav>
        <div className="header-actions"><a className="header-domain-status" href="#domain-status"><span className="status-dot" />{t.domainStatus}</a>
          <button className="language-button" onClick={() => setLanguage(language === "km" ? "en" : "km")}><Languages size={16} />{t.language}</button>
        </div>
      </header>

      <main className="main-container">
        <section className="hero"><div className="eyebrow"><Sparkles size={13} />{t.badge}</div>
          <h1>{t.heading}</h1><p>{t.intro}</p>
        </section>

        <section className="generator-card" aria-labelledby="generator-title">
          <div className="card-top"><h2 id="generator-title"><Mail size={17} />{t.generator}</h2><span className="receive-badge"><ShieldCheck size={14} />{t.nameFormat}</span></div>
          <div className="address-row flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="address-input"><label className="sr-only" htmlFor="username">{t.username}</label><input id="username" value={username} disabled={generating} onChange={(event) => { setUsername(event.target.value.toLowerCase()); setNotice(false); }} maxLength={64} spellCheck={false} autoCapitalize="none" autoComplete="off" aria-invalid={!email} aria-describedby={!email ? "address-error" : undefined} />
              <div className="domain-input"><span className="at-sign">@</span><label className="sr-only" htmlFor="domain">{t.domain}</label><select className="min-w-[220px] sm:min-w-[250px] px-3 py-2" id="domain" value={domain} onChange={(event) => chooseDomain(event.target.value)}>{MAIL_DOMAINS.map((item) => <option key={item}>{item}</option>)}</select></div>
            </div>
            <button className="primary-button copy-email" onClick={() => email && void copy(email)} disabled={!email}>{copied === email ? <Check size={18} /> : <Copy size={18} />}{copied === email ? t.copied : t.copy}</button>
          </div>
          {!email && <p id="address-error" className="field-error">{t.invalid}</p>}
          <div className="generator-bottom"><div className="generator-actions">
            <button className="action-button" disabled={generating} aria-busy={generating} onClick={() => void freshEmail()}>{generating ? <LoaderCircle size={16} className="spin" /> : <Shuffle size={16} />}{t.random}</button>
            <button className="action-button" disabled={!email || deleting} onClick={() => email && void refresh(email)}><RefreshCw size={16} className={busy ? "spin" : ""} />{t.refresh}</button>
            <button className="action-button delete-action" disabled={!email || deleting} onClick={() => setModal("delete")}><Trash2 size={16} />{t.delete}</button>
          </div><div className="active-address"><span className="status-dot" />{email ?? t.invalid}</div></div>
          <p className="sr-only">{t.tip}</p>
        </section>

        <AdSlot id="primary-leaderboard" width={728} height={90} label={t.ad} />

        <div className="feedback" aria-live="polite">{error ? <p className="error-notice" role="alert">{t[error]}</p> : notice ? <p className="success-notice">{t.cleared}</p> : null}</div>
        {ready === false && <p className="setup-notice">{t.setup}</p>}

        <div className="mail-workspace"><section className="inbox-card" aria-labelledby="inbox-title">
          <div className="inbox-heading"><h2 id="inbox-title"><Inbox size={19} />{t.inbox}<span className="count-badge">{emails.length}</span></h2><span className="inbox-live"><span className="status-dot" />LIVE</span></div>
          <div className="live-strip"><span><span className="status-dot pulse" />{t.waiting}</span><span>{t.interval}</span></div>
          {emails.length ? (
            <div className="email-list" aria-busy={busy}>{emails.map((message) => <article key={message.id} className={`email-row${selected?.id === message.id ? " selected" : ""}`}>
              <button className="message-open" onClick={() => setSelectedId(message.id)} aria-pressed={selected?.id === message.id} aria-label={`${t.open}: ${message.subject || t.noSubject}`}><span className="sender-avatar">{message.sender.charAt(0).toUpperCase()}</span><span className="message-summary"><span className="sender-line"><strong>{message.sender}</strong></span><span className="relative-time"><Clock3 size={11} />{inbox.now - message.timestamp < 60_000 ? t.justNow : `${Math.floor((inbox.now - message.timestamp) / 60_000)} ${t.minutesAgo}`}</span><span className="message-subject">{message.subject || t.noSubject}</span></span></button>
              {message.otp_code && <button className="otp-button row-otp" aria-label={`${t.otp}: ${message.otp_code}`} onClick={() => void copy(message.otp_code!)}><KeyRound size={14} /><strong>{message.otp_code}</strong><span>{copied === message.otp_code ? t.copied : t.otp}</span>{copied === message.otp_code ? <Check size={14} /> : <Copy size={14} />}</button>}
            </article>)}</div>
          ) : <div className="empty-inbox"><div className="empty-illustration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="float-star star-one">✦</span><span className="float-star star-two">✧</span><Inbox size={43} strokeWidth={1.3} /><span className="empty-notification"><Check size={12} /></span></div><h3>{t.empty}</h3><p>{t.emptyHint}</p></div>}
          <div className="inbox-footer"><Clock3 size={13} /><span>{t.expires}</span><span>{t.inboxLimit}</span></div>
        </section>

        <div className="reader-column"><section className="reader-card" aria-label={t.messagePreview}>
          {selected ? <EmailReader email={selected} language={language} onCopy={(value) => void copy(value)} copied={copied} /> : <div className="reader-placeholder"><span><Mail size={30} /></span><h2>{t.messagePreview}</h2><p>{t.previewHint}</p></div>}
        </section>
        <AdSlot id="reader-ad" width={300} height={250} label={t.ad} />
        </div></div>

        <DomainStatusPanel language={language} selectedDomain={domain} onSelect={chooseDomain} />

        <div className="public-notice"><ShieldCheck size={15} /><p>{t.public}</p></div>
      </main>

      {modal && <Modal title={t.delete} closeLabel={t.close} onClose={() => { if (!deleting) setModal(null); }}>
        <p>{t.confirmDelete}</p><div className="modal-actions"><button className="action-button" disabled={deleting} onClick={() => setModal(null)}>{t.cancel}</button><button className="danger-button" disabled={deleting} onClick={() => void deleteInbox()}>{deleting && <LoaderCircle size={15} className="spin" />}{t.confirm}</button></div>
      </Modal>}
    </div>
  );
}

export default function TempMail() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? <Workspace /> : <main className="boot-screen"><Mail size={32} /><h1>Tenh Temp Mail</h1><p>កំពុងរៀបចំប្រអប់សារ… / Preparing your inbox…</p></main>;
}
