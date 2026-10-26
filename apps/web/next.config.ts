import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dawnistic/geo-my", "@dawnistic/map-style", "@dawnistic/mapistic-db"],
};

export default nextConfig;
