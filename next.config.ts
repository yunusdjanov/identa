import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Loopback origins are only needed when the browser talks to a local Laravel
// (8001) or Expo (8100) backend in development. They are stripped from the
// production policy so a deployed build never whitelists plaintext http.
const devConnectSrc = isProduction
  ? []
  : ["http://127.0.0.1:8001", "http://localhost:8001", "http://127.0.0.1:8100", "http://localhost:8100"];
const devImgSrc = isProduction ? [] : ["http://127.0.0.1:8001", "http://localhost:8001"];
const directUploadConnectSrc = [
  "https://*.r2.cloudflarestorage.com",
  "https://*.r2.dev",
];

// 'unsafe-eval' is required by React Refresh / HMR in development only. The
// production bundle must not allow eval(); 'unsafe-inline' stays because Next
// emits inline hydration scripts without a nonce (a nonce migration is the
// next hardening step).
//
// Third-party origins explicitly whitelisted (all required for the live
// product, not nice-to-have):
//   - https://va.vercel-scripts.com  → Vercel Analytics + Speed Insights
//   - https://accounts.google.com    → Google Identity Services (Login,
//                                     register, and the Connected Accounts
//                                     link flow). Without this, the GSI
//                                     script is blocked, `window.google`
//                                     never appears, and the Continue-
//                                     with-Google button shows but does
//                                     nothing — exactly the production
//                                     symptom we saw post-deploy.
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  ...(isProduction ? [] : ["'unsafe-eval'"]),
  "https://va.vercel-scripts.com",
  "https://accounts.google.com",
].join(" ");

// `script-src-elem` governs <script> element loads specifically. Without it,
// some browsers fall back to `script-src` (with a console warning), but
// stricter ones treat the absence as a deny. Set it explicitly so the GSI
// loader works on every browser we support.
const scriptSrcElem = [
  "script-src-elem 'self' 'unsafe-inline'",
  "https://va.vercel-scripts.com",
  "https://accounts.google.com",
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  scriptSrc,
  scriptSrcElem,
  // Google ships some inline style for the rendered Continue-with-Google
  // button; without `https://accounts.google.com` here the button comes
  // through unstyled.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  ["img-src 'self' data: blob: https:", ...devImgSrc].join(" "),
  [
    "connect-src 'self' https://api.identa.uz",
    ...devConnectSrc,
    ...directUploadConnectSrc,
    "https://vitals.vercel-insights.com",
    "https://*.vercel-insights.com",
    // GSI verifies tokens against accounts.google.com behind the scenes;
    // also needed for the One-Tap session iframe → parent postMessage
    // handshake.
    "https://accounts.google.com",
    // Sentry browser SDK ships envelope POSTs to a region-specific
    // ingest host (`o<orgId>.ingest.<region>.sentry.io`). The wildcard
    // covers EU + US + sentry.io rotations without coupling the CSP to
    // the org id in the DSN.
    "https://*.sentry.io",
  ].join(" "),
  // GSI renders the actual "Continue with Google" button as an iframe
  // pointed at accounts.google.com. Without this, the iframe is blocked
  // and the user sees a 1px wide hairline where the button should be.
  "frame-src 'self' https://accounts.google.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  // HSTS only ships in production — on http://localhost it would pin the
  // browser to https and break local dev.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const noIndexHeaders = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive",
  },
];

const nextConfig: NextConfig = {
  // Keep deployment traces scoped to this application even when the checkout
  // lives inside a Git worktree whose parent repository has another lockfile.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "radix-ui"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8001",
        pathname: "/api/v1/patients/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8001",
        pathname: "/api/v1/patients/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source:
          "/:path(login|register|forgot-password|reset-password|verify-email|dashboard|patients|appointments|payments|billing|analytics|settings|staff|team|admin|api)(.*)",
        headers: noIndexHeaders,
      },
    ];
  },
};

export default nextConfig;
