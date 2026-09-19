"use client";

import { ArrowRight, ShoppingCart, Store, MapPin, Globe2, Grid2X2, Sparkles, Home, Share2 } from "lucide-react";

import { useStorefrontLanguage } from "./storefront-language";
import { useEffect, useState } from "react";

export type StorefrontBrand = {
  locationUrl?: string; address?: string | null; name: string; businessType: string; businessTypeLabel: string;
  logoUrl: string | null; bannerUrl: string | null; description: string | null;
  newArrivalsEnabled?: boolean; ownerUrl: string; orderingEnabled: boolean; allowDelivery: boolean; allowPickup: boolean;
};

export default function StorefrontHero({ brand, cartQuantity, onOpenCart }: {
  brand: StorefrontBrand; cartQuantity: number; onOpenCart: () => void;
}) {
  const { language, setLanguage, t } = useStorefrontLanguage();
  const [active, setActive] = useState("#store-home");
  useEffect(() => {
    const update = () => setActive(window.location.hash.startsWith("#category-") ? "#store-products" : window.location.hash || "#store-home");
    const frame = requestAnimationFrame(update);
    window.addEventListener("hashchange", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", update); };
  }, []);
  const locationUrl = brand.locationUrl || (brand.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}` : null);
  const fashion = brand.businessType === "fashion";
  const banner = brand.bannerUrl || (fashion ? "/images/storefront/fashion-hero.png" : null);
  return <>
    <div className="store-topbar">{locationUrl && <a href={locationUrl} target="_blank" rel="noreferrer"><MapPin size={14} />{t("View Our Location")}</a>}<label className="store-language"><Globe2 size={14} /><select aria-label="Store language" value={language} onChange={event => setLanguage(event.target.value)}><option value="en">ENG</option><option value="km">ខ្មែរ</option></select></label></div>
    <header className="store-header">
      <div className="shop-brand">
        {brand.logoUrl ? <img src={brand.logoUrl} alt={`${brand.name} logo`} /> : <span className="shop-logo-fallback"><Store size={23} /></span>}
        <div><p>{brand.name}</p><span>{t(brand.businessTypeLabel)}</span></div>
      </div>
      <nav className="store-header-menu" aria-label="Store navigation"><a href="#store-home" aria-current={active === "#store-home" ? "page" : undefined}><Home size={15} />{t("Home")}</a><a href="#store-products" aria-current={active === "#store-products" ? "page" : undefined}><Grid2X2 size={15} />{t("All products")}</a>{brand.newArrivalsEnabled !== false && <a href="#new-arrivals" aria-current={active === "#new-arrivals" ? "page" : undefined}><Sparkles size={15} />{t("New arrivals")}</a>}<a href="#contact-us" aria-current={active === "#contact-us" ? "page" : undefined}><Share2 size={15} />{t("Social")}</a></nav>
      <div className="store-header-actions">
        <button type="button" onClick={onOpenCart} className="header-cart" aria-label={`Open cart, ${cartQuantity} items`}><ShoppingCart size={23} /><span>{cartQuantity}</span></button>
      </div>

    </header>
    <section className="store-hero">
      {banner && <img src={banner} alt="" className="hero-image" />}
      <div className="hero-shade" />
      <div className="hero-content">
        <h1>{brand.name}</h1>
        <p className="hero-description">{brand.description || (fashion ? "Stylish essentials for your everyday story.\nFind your next favorite, made for your style." : "Explore our collection and find your next favorite.")}</p>
        <div className="hero-actions">
          {brand.newArrivalsEnabled !== false && <a href="#new-arrivals" className="hero-shop-link">{t("Shop New Arrivals")} <ArrowRight size={17} /></a>}
          <a href="#store-products" className="hero-shop-link hero-browse-link">{t("Browse Collection")}</a>
        </div>
      </div>
      {fashion && <div className="hero-editorial" aria-hidden="true"><span>Good Clothes.<br />Brighter Days.</span><small>FASHION<br />LIVES HERE</small></div>}
    </section>
  </>;
}
