import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Hanuman, Inter } from "next/font/google";
import { Toaster } from "sonner";

import LanguageProvider from "@/components/providers/language-provider";
import ThemeProvider from "@/components/providers/theme-provider";
import PhotoCache from "@/components/providers/photo-cache";
import {
  LANGUAGE_COOKIE,
  normalizeLanguage,
} from "@/lib/i18n/translations";
import {
  APP_SUBDOMAIN,
  getSubdomainFromHost,
  isLocalRootDomain,
} from "@/lib/tenancy/domain";

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

const baseMetadata: Metadata = {
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
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// Only the app host (or the single local dev host) installs as a Home Screen
// app; storefront and marketing hosts stay ordinary Safari pages.
async function isInstallableHost() {
  const requestHeaders = await headers();
  const subdomain = getSubdomainFromHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  return subdomain === APP_SUBDOMAIN || (isLocalRootDomain() && !subdomain);
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isInstallableHost())) return baseMetadata;
  return {
    ...baseMetadata,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Tenh POS", statusBarStyle: "default" },
    // Next emits only mobile-web-app-capable; older iOS needs the apple- prefix.
    other: { "apple-mobile-web-app-capable": "yes" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  if (!(await isInstallableHost())) return {};
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#020617" },
    ],
  };
}

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
