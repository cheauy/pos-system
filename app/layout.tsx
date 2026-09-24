import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Hanuman, Inter } from "next/font/google";
import { Toaster } from "sonner";

import LanguageProvider from "@/components/providers/language-provider";
import ThemeProvider from "@/components/providers/theme-provider";
import PhotoCache from "@/components/providers/photo-cache";
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
  preload: false,
});


const THEME_BOOTSTRAP = `(() => {
  try {
    let appearance = {};
    try { appearance = JSON.parse(localStorage.getItem("tenh-appearance") || "{}") || {}; } catch {}
    const saved = appearance.theme || localStorage.getItem("theme");
    const theme = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  } catch {}
})();`;

export const metadata: Metadata = {
  title: {
    default: "Tenh POS | Manage your Business",
    template: "%s | Tenh POS",
  },
  applicationName: "Tenh POS",
  description:
    "Manage your business with Tenh POS — sales, inventory, customers, reports and online ordering in one place.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
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
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}
        />
      </head>
      <body>
        <PhotoCache />
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
