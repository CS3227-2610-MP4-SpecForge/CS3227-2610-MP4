import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // The deploy workflow passes the commit SHA; /api/health reports it so a check
  // can tell which build is answering. Fixed at build time, empty locally.
  env: { SPECFORGE_REVISION: process.env.SPECFORGE_REVISION ?? "" },
  distDir: process.env.SPECFORGE_BROWSER_ORIGIN ? ".next-browser" : ".next",
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` },
    ] }];
  },
};
export default config;
