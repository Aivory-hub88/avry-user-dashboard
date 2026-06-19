import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/dashboard",
  assetPrefix: "/dashboard",
  reactStrictMode: false,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
