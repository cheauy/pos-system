import TempMail from "../components/TempMail";
import SeoContent from "../components/SeoContent";
import AdSlot from "../components/AdSlot";
import { faqPageSchema, webSiteSchema } from "../lib/seo.ts";

export default function Page() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([webSiteSchema, faqPageSchema]).replace(/</g, "\\u003c") }} /><TempMail /><div className="native-ad-container"><AdSlot id="native-banner" width={1200} height={320} label="Advertisement" format="native" /></div><SeoContent /></>;
}
