/**
 * Security headers for every route (auditoría 17/11/2026), plus no-store on HTML that must not go stale.
 * CSP is limited to directives that never block scripts, styles, map tiles or Turnstile:
 * the site cannot be framed, <base> and plugins are disabled and forms only post to this origin.
 * HSTS starts without includeSubDomains/preload so it never affects other hostnames of the domain.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: securityHeaders,
    }, {
      source: "/",
      headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
    }, {
      source: "/admin/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
    }];
  },
};

module.exports = nextConfig;
module.exports.securityHeaders = securityHeaders;
