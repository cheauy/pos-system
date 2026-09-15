import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Hanuman, Inter } from "next/font/google";
import { Toaster } from "sonner";

import LanguageProvider from "@/components/providers/language-provider";
import ThemeProvider from "@/components/providers/theme-provider";
import {
  LANGUAGE_COOKIE,
  normalizeLanguage,
} from "@/lib/i18n/translations";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const hanuman = Hanuman({
  subsets: ["khmer"],
  weight: ["400", "700"],
  variable: "--font-hanuman",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Tenh POS",
    template: "%s | Tenh POS",
  },
  description:
    "POS, inventory and online ordering for modern businesses.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialLanguage = normalizeLanguage(
    cookieStore.get(LANGUAGE_COOKIE)?.value,
  );

  return (
    <html
      lang={initialLanguage}
      data-language={initialLanguage}
      suppressHydrationWarning
      className={`${inter.variable} ${hanuman.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider initialLanguage={initialLanguage}>
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
            />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
