import type { Metadata } from "next";
import { Hanuman, Poppins } from "next/font/google";
import { SITE_URL } from "../lib/config.ts";
import { DESCRIPTION_EN, DESCRIPTION_KM, pageMetadata, SEO_TITLE, webApplicationSchema } from "../lib/seo.ts";
import SiteFooter from "../components/SiteFooter";
import "./globals.css";

const hanuman = Hanuman({ subsets: ["khmer"], variable: "--font-hanuman", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...pageMetadata(SEO_TITLE, `${DESCRIPTION_EN} ${DESCRIPTION_KM}`, "/"),
  keywords: ["Free Temp Mail", "Disposable Email", "Automated QA Testing", "Email Privacy", "Receive OTP Online", "10 Minute Mail Alternative", "Temp Mail Cambodia", "បង្កើតអ៊ីមែលបណ្តោះអាសន្ន", "អ៊ីមែលទទួលកូដ OTP"],
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${hanuman.variable} ${poppins.variable}`}><head><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema).replace(/</g, "\\u003c") }} /></head><body>{children}<SiteFooter /></body></html>;
}
