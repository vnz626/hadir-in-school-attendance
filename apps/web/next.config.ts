import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

const config: NextConfig = {
  // Jangan biarkan Next.js membuat AGENTS.md sendiri: aturan proyek hanya di AGENTS.md akar.
  agentRules: false,
  // Web dan API satu origin: browser hanya bicara ke Next.js (ADR 004).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
