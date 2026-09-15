import Link from "next/link";
import {
  ArrowRight,
  Building2,
  QrCode,
  ShoppingBag,
  Store,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
              <Building2 size={22} />
            </div>
            <div>
              <p className="font-bold">TENH POS</p>
              <p className="text-xs text-slate-400">
                Business & online ordering
              </p>
            </div>
          </div>

          <Link
            href="/login"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Sign in
          </Link>
        </header>

        <section className="grid min-h-[calc(100vh-8rem)] items-center gap-12 py-16 lg:grid-cols-2">
          <div>
            <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-300">
              One POS. One online store.
            </span>

            <h1 className="mt-6 max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
              Run your shop and sell online with TENH POS.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Create a business workspace, manage sales and inventory, and give customers a TENH storefront they can open from a link or QR code.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500"
              >
                Open TENH POS
                <ArrowRight size={17} />
              </Link>

              <span className="inline-flex items-center rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-300">
                yourshop.tenh-pos.com
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={<Store size={22} />}
              title="Your own storefront"
              text="Every business can use its own TENH POS subdomain."
            />
            <FeatureCard
              icon={<QrCode size={22} />}
              title="QR ordering"
              text="Customers can scan, browse and order from their phone."
            />
            <FeatureCard
              icon={<ShoppingBag size={22} />}
              title="Any business type"
              text="Restaurant, milk tea, fashion, shoes, accessories and more."
            />
            <FeatureCard
              icon={<Building2 size={22} />}
              title="POS + online together"
              text="Owners and staff keep one dashboard for the business."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
        {icon}
      </div>
      <h2 className="mt-5 text-lg font-bold">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        {text}
      </p>
    </div>
  );
}
