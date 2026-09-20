import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Banknote,
  ChevronRight,
  Languages,
  LockKeyhole,
  MapPinned,
  Palette,
  Printer,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
import { hasPermission } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";

type SettingItem = {
  title: string;
  description: string;
  href: string;
  icon: typeof Languages;
  details: string[];
  visible?: boolean;
};

const baseSettings: SettingItem[] = [
  {
    title: "Appearance & Language",
    description: "Choose English or Khmer and set your preferred theme.",
    href: "/dashboard/settings/system",
    icon: Palette,
    details: [
      "Language preference",
      "Light / Dark theme",
      "Interface settings",
    ],
  },
  {
    title: "Profile",
    description: "Manage your personal account and profile information.",
    href: "/dashboard/settings/profile",
    icon: UserRound,
    details: [
      "Personal profile",
      "Contact information",
      "Account preferences",
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

  const [
    { data: locations },
    { data: memberships },
    businessMode,
  ] = await Promise.all([
    supabaseAdmin
      .from("business_locations")
      .select("id,is_active")
      .eq("business_id", business.id),
    supabaseAdmin
      .from("business_members")
      .select("id,role,is_active")
      .eq("business_id", business.id),
    getCurrentBusinessMode({
      businessId: business.id,
      productMode: business.productMode,
    }),
  ]);

  const locationRows = (locations ?? []) as unknown as Array<{
    id: string;
    is_active: boolean | null;
  }>;
  const membershipRows = (memberships ?? []) as unknown as Array<{
    id: string;
    role: string;
    is_active: boolean | null;
  }>;

  const branchCount = locationRows.filter(
    (location) => location.is_active !== false,
  ).length;

  const employeeCount = membershipRows.filter(
    (member) =>
      member.is_active !== false &&
      member.role !== "owner",
  ).length;

  const businessType = businessMode.shortLabel;

  const canManageUsers =
    business.role === "owner" || business.role === "admin";
  const canManageBranches = hasPermission(
    business.role,
    "locations.manage",
  );
  const canManageReceipt = hasPermission(
    business.role,
    "business.update",
  );

  const settingsItems: SettingItem[] = [
    ...baseSettings,
    {
      title: "POS Currency",
      description: "Enable USD / KHR display and configure your store exchange rate.",
      href: "/dashboard/settings/pos-currency",
      icon: Banknote,
      visible: business.role === "owner",
      details: ["$ / ៛ switch", "Default $1 = 4,000៛", "Saved order rate snapshots"],
    },
    {
      title: "Printer Settings",
      description: "Configure receipts, barcode labels and shipping labels with live previews.",
      href: "/dashboard/settings/printers",
      icon: Printer,
      visible: canManageReceipt,
      details: [
        "Receipt templates",
        "Barcode label settings",
        "Shipping labels and live previews",
      ],
    },
    {
      title: "Users",
      description: "Manage employee accounts and staff permissions.",
      href: "/dashboard/settings/users",
      icon: UsersRound,
      visible: canManageUsers,
      details: [
        "Add or remove users",
        "Roles and permissions",
        "Access control",
      ],
    },
  ].filter((item) => item.visible !== false);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
          General
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your business, account, appearance, security, printers and users.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid divide-y divide-slate-100 lg:grid-cols-[2.2fr_repeat(2,minmax(0,0.85fr))] lg:divide-x lg:divide-y-0 dark:divide-slate-800">
          <Link
            href="/dashboard/settings/business"
            aria-label={`Manage ${business.name} store URL and business mode`}
            className="group flex min-w-0 items-center gap-4 p-5 transition hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-6 dark:hover:bg-blue-950/20"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:group-hover:bg-blue-900/60">
              <Store size={27} strokeWidth={2.1} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-slate-950 dark:text-white">
                {business.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">Business mode:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {businessType}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  System Online
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="text-slate-400">All systems operational</span>
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Modern POS for growing businesses
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 opacity-80 transition group-hover:translate-x-0.5 group-hover:opacity-100 dark:text-blue-300">
              <span className="hidden sm:inline">Change URL & mode</span>
              <ChevronRight size={17} />
            </div>
          </Link>

          <SummaryMetric
            icon={Building2}
            value={branchCount}
            label="Branches"
            href={canManageBranches ? "/dashboard/locations" : undefined}
            action="Manage"
          />
          <SummaryMetric
            icon={UsersRound}
            value={employeeCount}
            label="Employees"
            href={canManageUsers ? "/dashboard/settings/users" : undefined}
            action="Manage"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {settingsItems.map((item) => (
          <SettingsCard key={item.href} item={item} />
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Keep your business secure and up to date
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Regularly review your settings, manage user access, and export important business data.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/settings/security"
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-blue-100 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 sm:self-center dark:border-blue-900/50 dark:hover:bg-blue-950/30"
        >
          Review security
          <ArrowRight size={14} />
        </Link>
      </section>
    </main>
  );
}

function SettingsCard({ item }: { item: SettingItem }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="group relative min-h-[210px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900"
    >
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-36 w-36 rounded-full bg-gradient-to-br from-blue-50 to-slate-50 opacity-90 transition group-hover:scale-110 dark:from-blue-950/30 dark:to-slate-900" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Icon size={21} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-950 dark:text-white">
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
            <span>{detail}</span>
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

function SummaryMetric({
  icon: Icon,
  value,
  label,
  href,
  action,
}: {
  icon: typeof Building2;
  value: string | number;
  label: string;
  href?: string;
  action: string;
}) {
  return (
    <div className="flex items-center gap-3 p-5 sm:p-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
        <Icon size={19} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-slate-950 dark:text-white">
          {value}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        {href ? (
          <Link
            href={href}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            {action}
            <ArrowRight size={11} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

