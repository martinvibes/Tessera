import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to the monorepo root, not the user's home
  // (which has a stray package-lock.json that Next 16 was misidentifying).
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  // Same hint for Webpack output file tracing (used by `next build`).
  outputFileTracingRoot: path.resolve(__dirname, ".."),
};

export default nextConfig;
