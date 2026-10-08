import Link from "next/link";
import {
  Building2,
  Banknote,
  Bell,
  Headphones,
  ChevronRight,
  Languages,
  LockKeyhole,
  MapPinned,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { businessHasPermission } from "@/lib/auth/effective-permissions";

type SettingItem = {
  title: string;
  description: string;
  href: string;
  icon: typeof Languages;
  details: string[];
  visible?: boolean;
};

const profileSetting: SettingItem = {
  title: "Profile",
  description: "Manage your personal account and profile information.",
  href: "/dashboard/settings/profile",
  icon: UserRound,
  details: [
    "Personal profile",
    "Contact information",
    "Account preferences",
  ],
};

const baseSettings: SettingItem[] = [
  {
    title: "System & Display",
    description: "Manage POS behavior, language and display preferences.",
    href: "/dashboard/settings/system",
    icon: Palette,
    details: [
      "Language preference",
      "Light / Dark theme",
      "Interface settings",
    ],
  },
  {
    title: "Security",
    description: "Update your password and protect your login.",
    href: "/dashboard/settings/security",
    icon: ShieldCheck,
    details: [
      "Change password",
      "Account protection",
      "Login security",
    ],
  },
];

export default async function SettingsPage() {
  const business = await getCurrentBusiness();

  const [canViewBusiness, canViewStorefront] = await Promise.all([
    businessHasPermission(business, "business.view"),
    businessHasPermission(business, "storefront.view"),
  ]);
  const businessSettings: SettingItem[] = [
    { title: "Business Settings", description: "Manage your business details, online store and store hours.", href: "/dashboard/settings/business", icon: Building2, visible: canViewBusiness || canViewStorefront, details: ["Business details and Store URL", "Online store, branding and fulfillment", "Store hours and online payments"] },
  ].filter(item => item.visible !== false);

  const settingsItems: SettingItem[] = [
    ...baseSettings,
    { title: "Report a Bug", description: "Tell our support team about a problem.", href: "/dashboard/settings/support", icon: Headphones, details: ["Send a bug report", "Track your reports", "See resolution status"] },
    { title: "Notification Settings", description: "Choose who receives each business alert.", href: "/dashboard/settings/notifications", icon: Bell, visible: business.role === "owner", details: ["Alert recipients", "Role visibility", "Order and stock alerts"] },
    {
      title: "Currency Settings",
      description: "Set your store currency, exchange rate and money format.",
      href: "/dashboard/settings/pos-currency",
      icon: Banknote,
      visible: business.role === "owner",
      details: ["USD by default", "Exchange rate", "Live format preview"],
    },

  ].filter((item) => item.visible !== false);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
          General Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your business, online store, account and preferences.
        </p>
      </section>

      {/* One two-column grid: Business Settings and Profile share the top row; an odd last card spans both columns so no gap is left. */}
      <section className="grid gap-4 md:grid-cols-2" aria-label="Settings">
        {[...businessSettings, profileSetting, ...settingsItems].map((item) => (
          <SettingsCard key={item.href} item={item} />
        ))}
      </section>

    </main>
  );
}

function SettingsCard({ item }: { item: SettingItem }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="group relative min-h-[210px] min-w-0 overflow-hidden md:last:odd:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900"
    >
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-36 w-36 rounded-full bg-gradient-to-br from-blue-50 to-slate-50 opacity-90 transition group-hover:scale-110 dark:from-blue-950/30 dark:to-slate-900" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Icon size={21} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-bold text-slate-950 dark:text-white">
              {item.title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          </div>
        </div>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition group-hover:border-blue-200 group-hover:text-blue-600 dark:border-slate-700 dark:bg-slate-950">
          <ChevronRight size={16} />
        </span>
      </div>

      <div className="relative mt-5 space-y-2.5">
        {item.details.map((detail, index) => (
          <div
            key={detail}
            className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300"
          >
            <DetailIcon index={index} />
            <span className="min-w-0 break-words">{detail}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function DetailIcon({ index }: { index: number }) {
  const icons = [Languages, LockKeyhole, MapPinned];
  const Icon = icons[index % icons.length];

  return <Icon size={14} className="shrink-0 text-slate-400" />;
}
