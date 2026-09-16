import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import AppearanceForm from "./appearance-form";

export default function AppearanceSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <section>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to settings
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
          Appearance & Language
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose English or Khmer and set your preferred theme
        </p>
      </section>

      <AppearanceForm />
    </main>
  );
}
