import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // /api/health reports the built commit so a check can tell which build is
  // answering. Render sets RENDER_GIT_COMMIT during its build; SPECFORGE_REVISION
  // overrides it for a build elsewhere. Fixed at build time, empty locally.
  env: { SPECFORGE_REVISION: process.env.SPECFORGE_REVISION || process.env.RENDER_GIT_COMMIT || "" },
  distDir: process.env.SPECFORGE_BROWSER_ORIGIN ? ".next-browser" : ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`,
          },
        ],
      },
    ];
  },
};
export default config;
