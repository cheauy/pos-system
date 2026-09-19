"use client";
import { useStorefrontLanguage } from "./storefront-language";
import { Clock3, ExternalLink, Mail, MapPin, PhoneCall, Store } from "lucide-react";
import { FaFacebook, FaYoutube, FaXTwitter } from "react-icons/fa6";
import type { StorefrontSettings } from "@/lib/storefront/types";
import { formatOpeningTime, weekDays } from "@/lib/storefront/profile";

export default function StorefrontContact({ name, settings }: { name: string; settings: StorefrontSettings }) {
  const { t } = useStorefrontLanguage();
  const profile = settings.social_links?.profile;
  const hours = profile?.openingHours;
  const firstDay = hours?.days.monday;
  const sameHours = hours?.enabled && firstDay && !firstDay.closed && weekDays.every(day => {
    const value = hours.days[day];
    return value && !value.closed && value.open === firstDay.open && value.close === firstDay.close;
  });
  const links = ["facebook", "tiktok", "telegram", "instagram", "youtube", "whatsapp", "messenger", "x"] as const;
  const socialLabels = { facebook: "Facebook", tiktok: "TikTok", telegram: "Telegram", instagram: "Instagram", youtube: "YouTube", whatsapp: "WhatsApp", messenger: "Messenger", x: "X" };
  const socialImages = new Set(["instagram", "tiktok", "telegram", "whatsapp", "messenger"]);
  return <footer id="contact-us" className="mt-12 scroll-mt-6">
    <div className="store-contact-footer">
      <section className="footer-shop-profile">
        {settings.logo_url ? <img className="footer-shop-logo" src={settings.logo_url} alt={`${name} logo`} /> : <Store size={44} />}
        <h2>{name}</h2><p className="footer-description">{settings.description || "Find your favorites in our online collection."}</p>
        {settings.phone && <a className="contact-line" href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}><PhoneCall size={15} /><span>{settings.phone}</span></a>}
        {settings.address && <a className="contact-line" href={profile?.locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`} target="_blank" rel="noreferrer"><MapPin size={15} />{settings.address}</a>}
      {hours?.enabled && <details className="footer-hours"><summary><Clock3 size={17} />{sameHours && firstDay ? `Mon - Sun, ${formatOpeningTime(firstDay.open)} - ${formatOpeningTime(firstDay.close)}` : t("Opening hours")}</summary>
        <dl className="opening-hours-list">{weekDays.map(day => {
          const value = hours.days[day];
          return <div key={day} className="contents"><dt>{day}</dt><dd>{!value || value.closed ? t("Closed") : `${formatOpeningTime(value.open)} – ${formatOpeningTime(value.close)}${value.close < value.open ? " (+1 day)" : ""}`}</dd></div>;
        })}</dl><p className="mt-2 text-[10px]">{hours.timezone.replaceAll("_", " ")}</p>
      </details>}
      </section>
      <section><h2>{t("Social")}</h2><nav aria-label="Store social links" className="footer-social-links">
        {links.map(key => {
          const href = settings.social_links?.[key];
          return href && /^https?:\/\//i.test(href) ? <a key={key} href={href} target="_blank" rel="noreferrer" className="store-social-link">{key === "facebook" && <FaFacebook size={24} aria-hidden="true" className="text-blue-600" />}{key === "youtube" && <FaYoutube size={28} className="text-red-600" />}{key === "x" && <FaXTwitter size={28} />}{socialImages.has(key) && <img src={`/social/${key}.png`} alt="" width={24} height={24} loading="lazy" />}<span>{profile?.socialNames?.[key] || socialLabels[key]}</span><ExternalLink size={14} /></a> : null;
        })}

        {profile?.contactEmail && <a className="store-social-link" href={`mailto:${profile.contactEmail}`}><Mail size={28} /><span className="footer-email">{profile.contactEmail}</span></a>}
      </nav>{!links.some(key => settings.social_links?.[key]) && <p>Browse online or get in touch using our contact details.</p>}</section>

    </div>
    <div className="store-footer-bottom"><span>© {name}</span><span>Powered by Tenh POS</span></div>
  </footer>;
}
