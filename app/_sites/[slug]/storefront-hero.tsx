"use client";

import OrderTracking from "./order-tracking";
import { ArrowRight, ShoppingCart, Store, MapPin, Globe2, Grid2X2, Sparkles, Home, Share2, Menu, Search, X } from "lucide-react";

import { useStorefrontLanguage } from "./storefront-language";
import { useEffect, useState, type ReactNode } from "react";

export type StorefrontBrand = {
  socialLinks?: Record<string,string>;
  locationUrl?: string; address?: string | null; name: string; businessType: string; businessTypeLabel: string;
  logoUrl: string | null; bannerUrl: string | null; description: string | null;
  newArrivalsEnabled?: boolean; ownerUrl: string; orderingEnabled: boolean; allowDelivery: boolean; allowPickup: boolean;
};

export function StorefrontHeader({slug,brand,cartQuantity,onOpenCart,catalogHref="",search,onClose,onNavigate}:{slug:string;brand:StorefrontBrand;cartQuantity:number;onOpenCart:()=>void;catalogHref?:string;search?:ReactNode;onClose?:()=>void;onNavigate?:()=>void}) {
  const { language, setLanguage, t } = useStorefrontLanguage();
  const [active, setActive] = useState("#store-home");
  useEffect(() => {
    const update = () => setActive(window.location.hash.startsWith("#category-") ? "#store-products" : window.location.hash || "#store-home");
    const frame = requestAnimationFrame(update);
    window.addEventListener("hashchange", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", update); };
  }, []);
  const locationUrl = brand.locationUrl || (brand.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}` : null);
  const [menuOpen,setMenuOpen]=useState(false);
  return <>
    <div className="store-topbar">{locationUrl && <a href={locationUrl} target="_blank" rel="noreferrer"><MapPin size={14} />{t("View Our Location")}</a>}<label className="store-language"><Globe2 size={14} /><select aria-label={t("Store language")} value={language} onChange={event => setLanguage(event.target.value)}><option value="en">ENG</option><option value="km">ខ្មែរ</option></select></label></div>
    <header className="store-header">
      <button type="button" className="store-menu-toggle" aria-label={t("Store navigation")} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button>
      <a className="store-compact-brand" href={catalogHref+"#store-home"} onClick={onNavigate}>{brand.logoUrl?<img src={brand.logoUrl} alt=""/>:<Store size={24}/>}<span data-i18n-ignore="true">{brand.name}</span></a>
      <div className="shop-brand">
        {brand.logoUrl ? <img src={brand.logoUrl} alt={`${brand.name} ${t("logo")}`} /> : <span className="shop-logo-fallback"><Store size={23} /></span>}
        <div><p data-i18n-ignore="true">{brand.name}</p><span>{t(brand.businessTypeLabel)}</span></div>
      </div>
      <nav onKeyDown={event=>{if(event.key==="Escape"){setMenuOpen(false);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".store-menu-toggle")?.focus();}}} data-open={menuOpen} onClick={event=>{if((event.target as HTMLElement).closest("a[href]")){setMenuOpen(false);onNavigate?.();}}} className="store-header-menu" aria-label={t("Store navigation")}><a href={`${catalogHref}#store-home`} aria-current={active === "#store-home" ? "page" : undefined}><Home size={15} />{t("Home")}</a><a href={`${catalogHref}#store-products`} aria-current={active === "#store-products" ? "page" : undefined}><Grid2X2 size={15} />{t("All products")}</a>{brand.newArrivalsEnabled !== false && <a href={`${catalogHref}#new-arrivals`} aria-current={active === "#new-arrivals" ? "page" : undefined}><Sparkles size={15} />{t("New arrivals")}</a>}<a href="#contact-us" aria-current={active === "#contact-us" ? "page" : undefined}><Share2 size={15} />{t("Social")}</a><OrderTracking slug={slug} /></nav>
      <div className="store-header-actions"><a className="store-header-search-link" href={catalogHref+"#store-products"} onClick={onNavigate} aria-label={t("Search products")}><Search size={21}/></a>
        <button type="button" onClick={onOpenCart} className="header-cart" aria-label={`${t("Open cart")}, ${cartQuantity} ${t("items")}`}><ShoppingCart size={23} /><span>{cartQuantity}</span></button>
      </div>

    </header>
    {search&&<div className="store-header-search">{search}</div>}
    {onClose&&<button type="button" className="store-flow-back" onClick={onClose}>← {t("Continue shopping")}</button>}
  </>;
}

export default function StorefrontHero({ slug, brand, cartQuantity, onOpenCart, compact = false, catalogHref = "", search }: {
  slug: string; brand: StorefrontBrand; cartQuantity: number; onOpenCart: () => void; compact?: boolean; catalogHref?: string; search?: ReactNode;
}) {
  const {t}=useStorefrontLanguage();
  const fashion = brand.businessType === "fashion";
  const banner = brand.bannerUrl || null;
  return <>
    <StorefrontHeader slug={slug} brand={brand} cartQuantity={cartQuantity} onOpenCart={onOpenCart} catalogHref={catalogHref} search={compact?undefined:search}/>
    {!compact && <section className={`store-hero ${!banner ? "store-hero-blank" : ""}`}>
      {banner && <img src={banner} alt="" className="hero-image" />}
      <div className="hero-shade" />
      <div className="hero-content">
        <h1 data-i18n-ignore="true">{brand.name}</h1>
        <p className="hero-description" data-i18n-ignore={Boolean(brand.description)}>{brand.description || (fashion ? t("Stylish essentials for your everyday story.\nFind your next favorite, made for your style.") : t("Explore our collection and find your next favorite."))}</p>
        <div className="hero-actions">
          {brand.newArrivalsEnabled !== false && <a href={`${catalogHref}#new-arrivals`} className="hero-shop-link">{t("Shop New Arrivals")} <ArrowRight size={17} /></a>}
          <a href={`${catalogHref}#store-products`} className="hero-shop-link hero-browse-link">{t("Browse Collection")}</a>
        </div>
      </div>
      {fashion && <div className="hero-editorial" aria-hidden="true"><span>{t("Good Clothes.")}<br />{t("Brighter Days.")}</span><small>{t("FASHION")}<br />{t("LIVES HERE")}</small></div>}
    </section>}
  </>;
}
