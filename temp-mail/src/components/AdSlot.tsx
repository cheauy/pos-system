"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";

const AD_ORIGIN = "https://tenh-temp-mail.vercel.app";
const subscribe = () => () => {};

interface AdSlotProps {
  id: string;
  width: number;
  height: number;
  label: string;
  format?: "banner" | "native";
}

function AdSlot({ id, width, height, label, format = "banner" }: AdSlotProps) {
  const active = useSyncExternalStore(subscribe, () => true, () => false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ad, setAd] = useState({ status: "pending", height });
  const [leaderboardSize] = useState(() => typeof window !== "undefined" && window.innerWidth >= 800 ? "desktop" : "mobile");
  useEffect(() => {
    const timeout = setTimeout(() => setAd(previous => previous.status === "ready" ? previous : { ...previous, status: "unavailable" }), 12000);
    const receive = (event: MessageEvent) => {
      if (event.origin !== AD_ORIGIN || !frame.current || event.source !== frame.current.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "tenh-ad-state" || typeof data.visible !== "boolean" || !Number.isFinite(data.height)) return;
      if (!data.visible) {
        if (data.height === 0) setAd(previous => previous.status === "unavailable" ? previous : { ...previous, status: "unavailable" });
        return;
      }
      if (data.height < 20 || data.height > (format === "native" ? 3000 : height)) return;
      clearTimeout(timeout);
      const nextHeight = Math.ceil(data.height);
      setAd(previous => previous.status === "ready" && previous.height === nextHeight ? previous : { status: "ready", height: nextHeight });
    };
    window.addEventListener("message", receive);
    return () => { clearTimeout(timeout); window.removeEventListener("message", receive); };
  }, [format, height]);
  return (
    <aside className={`ad-slot ${format === "native" ? "ad-native" : width === 728 ? "ad-leaderboard" : "ad-reader"}`} aria-label={label} data-ad-state={ad.status} aria-hidden={ad.status !== "ready"}>
      <div className="ad-slot-top"><span className="ad-label">{label}</span>{format !== "native" && <><span className={width === 728 ? "ad-desktop-size" : undefined}>{width} × {height}</span>{width === 728 && <span className="ad-mobile-size">320 × 50</span>}</>}</div>
      <div id={id} className="ad-placement" style={{ maxWidth: width, height: ad.height }} data-ad-width={width} data-ad-height={height}>
        {active && <iframe ref={frame} className="ad-frame" src={`${AD_ORIGIN}/ads/${format === "native" ? "native" : width === 160 ? `sidebar-${height}` : width === 728 ? "leaderboard" : "inbox"}.html${format === "banner" && width === 728 ? `?size=${leaderboardSize}` : ""}`} title={label}
          width={width} height={ad.height} style={{ height: ad.height }} referrerPolicy="strict-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" scrolling="no" />
        }
      </div>
    </aside>
  );
}
export default memo(AdSlot);
