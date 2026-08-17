import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // TypeScript 7 ships only the native compiler — no `lib/typescript.js` API —
    // so Next has to type-check by spawning the `tsc` CLI. Without this the build
    // throws "TypeScript 7.0.2 does not provide the compiler API required by Next.js".
    useTypeScriptCli: true,
  },
};

export default nextConfig;
