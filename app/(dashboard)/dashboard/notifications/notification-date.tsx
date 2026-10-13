"use client";

import { useLanguage } from "@/components/providers/language-provider";

// Use server-formatted dates so hydration preserves the existing notification timezone.
export default function NotificationDate({ date, khmerDate, className }: { date: string; khmerDate: string; className: string }) {
  const { language } = useLanguage();
  return <h2 lang={language} data-i18n-ignore="true" className={className}>{language === "km" ? khmerDate : date}</h2>;
}
