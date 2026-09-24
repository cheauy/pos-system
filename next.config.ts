import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate production audits from a running development server.
  distDir: process.env.TENH_BUILD_DIR || '.next',
  images: {
    // Private/signed image URLs must never enter the public optimizer cache.
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [new URL('/storage/v1/object/public/product-images/**', process.env.NEXT_PUBLIC_SUPABASE_URL)]
      : [],
  },
  async headers() {
    return [{ source: '/photo-cache-sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }];
  },
   experimental: {
    serverActions: {
      // Allow three 5 MB store images plus multipart overhead (payment proof is capped at 10 MB).
      bodySizeLimit: "16mb",
    },
  },
};



export default nextConfig;
