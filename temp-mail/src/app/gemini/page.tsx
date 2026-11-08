import Image from "next/image";
import Link from "next/link";
import { Mail, Sparkles } from "lucide-react";
import { pageMetadata } from "../../lib/seo.ts";
import GeminiAds from "../../components/GeminiAds";
import photo01 from "../../../public/gemini/photo-01.png";
import photo02 from "../../../public/gemini/photo-02.png";
import photo03 from "../../../public/gemini/photo-03.png";
import photo04 from "../../../public/gemini/photo-04.png";
import photo05 from "../../../public/gemini/photo-05.png";
import photo06 from "../../../public/gemini/photo-06.png";
import photo07 from "../../../public/gemini/photo-07.png";
import photo08 from "../../../public/gemini/photo-08.png";
import photo09 from "../../../public/gemini/photo-09.png";
import photo10 from "../../../public/gemini/photo-10.png";
import photo11 from "../../../public/gemini/photo-11.png";

export const metadata = pageMetadata(
  "Gemini AI Pro 12month & 24month | Tenh Temp Mail",
  "Gemini AI Pro photo gallery with numbered screenshots and payment-card identifiers hidden.",
  "/gemini",
);

const photos = [
  { title: "Google One plans", image: photo01 },
  { title: "Browser extensions", image: photo02 },
  { title: "Extension panel", image: photo03 },
  { title: "Plans overview", image: photo04 },
  { title: "Payment options", image: photo05 },
  { title: "Checkout summary", image: photo06 },
  { title: "Membership overview", image: photo07 },
  { title: "Renewal summary", image: photo08 },
  { title: "Subscriptions list", image: photo09 },
  { title: "Subscription details", image: photo10 },
  { title: "Updated membership view", image: photo11 },
];

export default function GeminiGuide() {
  return <div className="app-shell">
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Tenh Temp Mail"><span className="brand-mark"><Mail size={22} /></span><span><span className="brand-title"><strong>Tenh<span>Mail</span></strong></span><small>Instant OTP Inbox</small></span></Link>
      <nav className="header-menu" aria-label="Main navigation"><Link className="header-menu-link" href="/">Temp Mail</Link><Link className="header-menu-link" href="/gemini" aria-current="page"><Sparkles size={15} />Gemini</Link></nav>
    </header>
    <div className="gemini-layout">
    <GeminiAds />
    <main className="editorial-container information-page gemini-guide" lang="en">
      <header className="editorial-intro"><span className="eyebrow"><Sparkles size={14} />Gemini</span><h1>Gemini AI Pro 12month &amp; 24month</h1></header>
      <ol className="gemini-steps">{photos.map((photo, index) => <li key={photo.title}>
        <article className="editorial-card gemini-step" id={`step-${index + 1}`} aria-labelledby={`step-title-${index + 1}`}>
          <h2 id={`step-title-${index + 1}`}><strong>Step {index + 1}: {photo.title}</strong></h2>
          {index === 0 && <><p>Go to <a href="https://one.google.com/" target="_blank" rel="noopener noreferrer">one.google.com</a> using your web browser and sign in with your Google account.</p><p>Click <strong>Settings</strong> on the left menu, then click <strong>Change membership plan</strong>.</p></>}
          {index === 8 && <><p>Open the subscription details and review the services included before choosing <strong>Cancel subscription</strong>.</p><p>The pictured Google One subscription includes both Google AI Pro and a YouTube Premium add-on. Cancelling the subscription shown may affect the whole bundle; check the confirmation before continuing.</p></>}
          <figure><a href={photo.image.src} target="_blank" rel="noopener noreferrer" aria-label={`Open step ${index + 1} photo at full size`}><Image src={photo.image} alt={`Provided screenshot ${index + 1}: ${photo.title}`} sizes="(max-width: 700px) calc(100vw - 72px), (max-width: 1100px) calc(100vw - 136px), 952px" preload={index === 0} /></a><figcaption>Photo {index + 1} · Open the image to view full size.</figcaption></figure>
        </article>
      </li>)}</ol>
      <Link className="editorial-link" href="/">← Back to the temporary email inbox</Link>
    </main>
    </div>
  </div>;
}
