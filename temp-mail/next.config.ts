import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  output: "standalone",
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/ads/:path*", has: [{ type: "host", value: "temp-mail.tenh-pos.com" }],
      destination: "https://tenh-temp-mail.vercel.app/ads/:path*", permanent: false }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }, { source: "/:path((?!ads/).*)", headers: [
      { key: "X-Frame-Options", value: "DENY" },
    ] }, { source: "/ads/:path*", headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://temp-mail.tenh-pos.com; sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" },
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }];
  },
};

export default config;
