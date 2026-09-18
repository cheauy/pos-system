import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  ClipboardList,
  Coffee,
  CreditCard,
  History,
  PackageSearch,
  QrCode,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

import {
  getAppUrl,
  getRootDomain,
  isLocalRootDomain,
} from "@/lib/tenancy/domain";

const productFeatures = [
  {
    icon: CreditCard,
    title: "Fast POS checkout",
    text: "Sell in store with products, variants, stock and order history connected to one business.",
  },
  {
    icon: Store,
    title: "Built-in online store",
    text: "Publish a customer-facing storefront on your TENH subdomain without moving the admin dashboard.",
  },
  {
    icon: QrCode,
    title: "QR ordering",
    text: "Let customers scan, browse products or menus, and place an online order from their phone.",
  },
  {
    icon: Boxes,
    title: "Inventory that stays together",
    text: "Track stock, low-stock levels, product variants, transfers and inventory activity from one place.",
  },
  {
    icon: Users,
    title: "Customers & staff",
    text: "Keep customer records while owners, admins, managers, cashiers and staff work in the same app.",
  },
  {
    icon: BarChart3,
    title: "Reports & control",
    text: "Follow sales, products, customers and operational activity with reports built into the dashboard.",
  },
];

const operationFeatures = [
  {
    icon: ShoppingBag,
    title: "Products & variants",
    text: "Fashion sizes and colours, shoes, standard products and mode-specific catalog workflows.",
  },
  {
    icon: Warehouse,
    title: "Inventory",
    text: "Stock levels, low-stock alerts, barcode workflows and branch-aware inventory operations.",
  },
  {
    icon: Truck,
    title: "Suppliers",
    text: "Maintain supplier records and connect purchasing to the products you actually receive.",
  },
  {
    icon: ClipboardList,
    title: "Purchase orders",
    text: "Create purchase orders, track incoming quantities and receive purchased stock into inventory.",
  },
  {
    icon: RefreshCw,
    title: "Returns",
    text: "Keep return activity connected to orders and your operational history.",
  },
  {
    icon: ReceiptText,
    title: "Orders",
    text: "In-store and online orders stay connected to the same TENH business workspace.",
  },
  {
    icon: Building2,
    title: "Branches & business modes",
    text: "Use TENH POS for different store models while keeping each business workspace isolated.",
  },
  {
    icon: History,
    title: "Audit & backup tools",
    text: "Keep important business actions traceable and retain operational backup/import tools.",
  },
];

const businessModes = [
  {
    icon: ShoppingBag,
    title: "Fashion & retail",
    text: "Sizes, colours, variant stock and storefront-ready product presentation.",
  },
  {
    icon: PackageSearch,
    title: "Shoes & accessories",
    text: "Variant-focused product workflows for size-based inventory and retail sales.",
  },
  {
    icon: Coffee,
    title: "Milk tea & café",
    text: "Counter-friendly product modes for drinks, café items and fast customer ordering.",
  },
  {
    icon: Tags,
    title: "General business",
    text: "A flexible product and inventory workflow for shops that do not need a specialized mode.",
  },
];

export default function Home() {
  const signInUrl = getAppUrl("/login");
  const createStoreUrl = getAppUrl("/register");
  const configuredRoot = getRootDomain();
  const publicDomain = isLocalRootDomain()
    ? "tenh-pos.com"
    : configuredRoot;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f8ff] text-slate-950">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] overflow-hidden">
          <div className="absolute -left-24 top-12 h-96 w-96 rounded-full bg-blue-200/60 blur-3xl" />
          <div className="absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-200/65 blur-3xl" />
          <div className="absolute left-[42%] top-52 h-72 w-72 rounded-full bg-cyan-100/70 blur-3xl" />
        </div>

        <header className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-3">
            <TenhLogo />
            <div>
              <div className="text-lg font-extrabold tracking-tight text-slate-950">
                TENH POS
              </div>
              <div className="text-xs font-medium text-slate-500">
                Business & online ordering
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
            <a href="#product" className="transition hover:text-blue-600">
              Product
            </a>
            <a href="#solutions" className="transition hover:text-blue-600">
              Solutions
            </a>
            <a href="#pricing" className="transition hover:text-blue-600">
              Pricing
            </a>
            <a href="#resources" className="transition hover:text-blue-600">
              Resources
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={signInUrl}
              className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-white/80 hover:text-blue-700 sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href={createStoreUrl}
              className="rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 sm:px-5"
            >
              Create store
            </Link>
          </div>
        </header>

        <section className="mx-auto grid max-w-[1500px] items-center gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12 lg:pb-24 lg:pt-16">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm backdrop-blur">
              <span className="flex h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_0_5px_rgba(139,92,246,0.12)]" />
              One POS. One online store.
            </div>

            <h1 className="mt-7 text-[clamp(3rem,6vw,5.8rem)] font-black leading-[0.94] tracking-[-0.055em] text-slate-950">
              Run your store and sell online with{" "}
              <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-orange-400 bg-clip-text text-transparent">
                TENH POS.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Manage sales, products, inventory, customers, staff, purchasing and online ordering from one business system built for in-store and online selling.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={createStoreUrl}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-4 text-sm font-extrabold text-white shadow-xl shadow-blue-200 transition hover:-translate-y-0.5"
              >
                Create your store
                <ArrowRight size={18} />
              </Link>
              <a
                href="#product"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-4 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
              >
                <Sparkles size={17} />
                See how it works
              </a>
            </div>

            <div className="mt-7 flex max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-lg shadow-slate-200/50">
              <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                yourshop
              </div>
              <div className="shrink-0 text-sm font-extrabold text-slate-400">
                .{publicDomain}
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Check size={18} strokeWidth={3} />
              </div>
            </div>

            <div className="mt-7 grid max-w-2xl grid-cols-2 gap-x-5 gap-y-4 text-sm font-semibold text-slate-600 sm:grid-cols-4">
              <MiniFeature icon={Store} label="POS + store" />
              <MiniFeature icon={QrCode} label="QR ordering" />
              <MiniFeature icon={Boxes} label="Inventory" />
              <MiniFeature icon={Building2} label="Business modes" />
            </div>
          </div>

          <div className="relative lg:pl-4">
            <div className="absolute -inset-8 -z-10 rounded-[48px] bg-gradient-to-br from-blue-200/65 via-violet-100/60 to-orange-100/50 blur-2xl" />
            <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white/80 p-2.5 shadow-[0_30px_80px_rgba(51,65,85,0.20)] backdrop-blur">
              <Image
                src="/marketing/tenh-pos-hero-product.png"
                alt="TENH POS dashboard and customer storefront preview"
                width={930}
                height={740}
                priority
                className="h-auto w-full rounded-[26px] object-cover"
              />
            </div>
          </div>
        </section>
      </div>

      <section className="border-y border-slate-200/80 bg-white/75 backdrop-blur">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-6 px-5 py-8 text-center sm:px-8 md:grid-cols-4 lg:px-12">
          <Stat label="Admin app" value="app.tenh-pos.com" />
          <Stat label="Public store" value="yourshop.tenh-pos.com" />
          <Stat label="Business identity" value="UUID-based" />
          <Stat label="Storefront" value="POS + online" />
        </div>
      </section>

      <section id="product" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <SectionHeading
          eyebrow="Everything connected"
          title="Run the counter, the store and the back office from one system."
          text="TENH POS keeps the daily tools a business needs together, while your public store stays separate from the admin application."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {productFeatures.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <section id="solutions" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-8">
              <SectionHeading
                eyebrow="Built around your operation"
                title="More than checkout."
                text="TENH POS already connects the workflows behind products, stock, purchasing, customers and business operations."
              />

              <div className="mt-8 rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900">Business isolation</p>
                    <p className="text-sm text-slate-500">Data stays scoped by business ID.</p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  The public subdomain locates the store. TENH keeps the permanent business UUID as the real identity for products, orders, customers, staff and inventory.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {operationFeatures.map((feature) => (
                <OperationCard key={feature.title} {...feature} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <SectionHeading
          eyebrow="Business modes"
          title="Use the same TENH platform for different kinds of stores."
          text="Choose the workflow that matches how the business sells without splitting the team across different admin systems."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {businessModes.map((mode) => (
            <ModeCard key={mode.title} {...mode} />
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-b from-white to-blue-50/70 py-20 lg:py-28">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-3">
            <DomainCard
              label="TENH Marketing"
              value={publicDomain}
              text="Your public TENH POS website for product, solution and account information."
            />
            <DomainCard
              label="TENH Admin / POS"
              value={`app.${publicDomain}`}
              text="Owners, admins, managers, cashiers and staff work from one centralized application."
            />
            <DomainCard
              label="TENH Public Store"
              value={`yourshop.${publicDomain}`}
              text="A customer-facing storefront for products, menus, online ordering and QR access."
            />
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="overflow-hidden rounded-[38px] border border-blue-100 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-8 text-white shadow-2xl shadow-blue-200 md:p-12 lg:p-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="text-sm font-extrabold uppercase tracking-[0.18em] text-blue-100">
                Subscription-ready
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                Start your TENH business and grow inside one workspace.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-blue-100">
                TENH POS keeps subscription status connected to the business, so the admin app and public storefront follow the same account controls.
              </p>
            </div>
            <Link
              href={createStoreUrl}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-extrabold text-blue-700 shadow-lg transition hover:-translate-y-0.5"
            >
              Create store
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section id="resources" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:px-12">
          <div>
            <div className="flex items-center gap-3">
              <TenhLogo compact />
              <div>
                <div className="font-extrabold text-slate-950">TENH POS</div>
                <div className="text-xs text-slate-500">Business & online ordering</div>
              </div>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-500">
              A connected POS, inventory and online ordering platform for businesses that want one operational workspace and one public TENH store.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-x-8 gap-y-4 text-sm font-bold text-slate-600">
            <a href="#product" className="hover:text-blue-600">Product</a>
            <a href="#solutions" className="hover:text-blue-600">Solutions</a>
            <a href="#pricing" className="hover:text-blue-600">Pricing</a>
            <Link href={signInUrl} className="hover:text-blue-600">Sign in</Link>
            <Link href={createStoreUrl} className="hover:text-blue-600">Create store</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function TenhLogo({ compact = false }: { compact?: boolean }) {
  const size = compact ? 40 : 48;

  return (
    <Image
      src="/tenh-pos-logo.png"
      alt="TENH POS"
      width={size}
      height={size}
      priority={!compact}
      className="shrink-0 object-contain"
    />
  );
}

function MiniFeature({
  icon: Icon,
  label,
}: {
  icon: typeof Store;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <Icon size={16} />
      </div>
      <span>{label}</span>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-sm font-extrabold uppercase tracking-[0.18em] text-blue-600">
        {eyebrow}
      </div>
      <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-lg leading-8 text-slate-600">{text}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/60">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 text-blue-600 ring-1 ring-blue-100">
        <Icon size={22} />
      </div>
      <h3 className="mt-5 text-xl font-extrabold tracking-tight text-slate-950">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function OperationCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-slate-200">
          <Icon size={19} />
        </div>
        <div>
          <h3 className="font-extrabold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Store;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 via-white to-violet-50 text-orange-500 ring-1 ring-orange-100">
        <Icon size={22} />
      </div>
      <h3 className="mt-5 text-lg font-extrabold text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function DomainCard({
  label,
  value,
  text,
}: {
  label: string;
  value: string;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="mt-3 break-all text-lg font-black text-blue-700">{value}</div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-sm font-extrabold text-slate-800 sm:text-base">
        {value}
      </div>
    </div>
  );
}
