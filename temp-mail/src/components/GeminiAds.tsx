"use client";

import { useState, useSyncExternalStore } from "react";
import AdSlot from "./AdSlot";

const subscribe = () => () => {};

export default function GeminiAds() {
  // Decide once after hydration; resizing never replaces an already loaded ad.
  const active = useSyncExternalStore(subscribe, () => true, () => false);
  const [desktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);
  if (!active || !desktop) return null;
  return <>
    <div className="gemini-ad-rail gemini-ad-left"><AdSlot id="gemini-left-ad" width={160} height={600} label="Advertisement" /></div>
    <div className="gemini-ad-rail gemini-ad-right"><AdSlot id="gemini-right-ad" width={160} height={300} label="Advertisement" /></div>
  </>;
}
