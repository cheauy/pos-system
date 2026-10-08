// Plain module (not "use client") so the server page can read the list too.
import { Building2, Clock3, LayoutDashboard, Palette, Search, Share2, Package, Store } from "lucide-react";

// Overview is the ungrouped landing item; the rest are listed under their group heading, in this order.
export const SETTINGS_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: null },
  { id: "business-info", label: "Business Info", icon: Building2, group: "Business" },
  { id: "branding", label: "Branding", icon: Palette, group: "Business" },
  { id: "store-hours", label: "Store Hours", icon: Clock3, group: "Business" },
  { id: "storefront", label: "Storefront", icon: Store, group: "Storefront" },
  { id: "product", label: "Product", icon: Package, group: "Storefront" },
  { id: "seo", label: "SEO & Meta", icon: Search, group: "Visibility" },
  { id: "social", label: "Social Links", icon: Share2, group: "Visibility" },
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
