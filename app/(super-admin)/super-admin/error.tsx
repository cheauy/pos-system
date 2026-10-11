"use client";

import { useLanguage } from "@/components/providers/language-provider";

export default function SuperAdminError({retry}: {retry: () => void}) {
  const {t} = useLanguage();
  return <section role="alert" className="space-y-4 rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-slate-950">
    <p className="font-semibold text-slate-900 dark:text-slate-100">{t("Unable to load this page.")}</p>
    <button type="button" onClick={retry} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{t("Try again")}</button>
  </section>;
}
