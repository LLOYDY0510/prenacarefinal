import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep build type checks in the compiler API.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
