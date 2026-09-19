import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   experimental: {
    serverActions: {
      // Allow three 5 MB store images plus multipart overhead (payment proof is capped at 10 MB).
      bodySizeLimit: "16mb",
    },
  },
};



export default nextConfig;
