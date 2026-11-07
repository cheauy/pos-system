import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900" data-i18n-ignore="true">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-6">
          <Link href="/" className="text-xl font-extrabold text-blue-600">Tenh-POS</Link>
          <nav aria-label="Legal" className="flex flex-wrap gap-5 text-sm font-semibold">
            <Link href="/privacy" className="hover:text-blue-600 hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:text-blue-600 hover:underline">Terms</Link>
            <Link href="/data-deletion" className="hover:text-blue-600 hover:underline">Data deletion</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Draft for review · Updated November 7, 2026</p>
        <article className="space-y-5 leading-7 text-slate-600 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:text-slate-950 [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-950 [&_a]:break-words [&_a]:text-blue-600 [&_a]:underline [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-6">{children}</article>
      </main>
      <footer className="mx-auto max-w-3xl space-y-1 border-t border-slate-200 px-5 py-8 text-sm leading-6 text-slate-500">
        <p className="font-bold text-slate-950">© 2026 Tenh-POS | <a href="https://tenh-pos.com" className="hover:underline">tenh-pos.com</a></p>
        <p>Legal Entity: HONG PHIRUN</p>
        <p>Tenh-POS is a brand of HONG PHIRUN</p>
        <p>No. 42, Street 302, Phsar Kandal 1, Khan Daun Penh, Phnom Penh, Cambodia</p>
        <p>Phone: <a href="tel:+85516729281" className="hover:underline">+855 16 729 281</a>{" | "}Email: <a href="mailto:hongphirun@tenh-pos.com" className="break-all hover:underline">hongphirun@tenh-pos.com</a></p>
      </footer>
    </div>
  );
}
