import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // izinkan upload foto nota hingga 10 MB lewat Server Action
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
