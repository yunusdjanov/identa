import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Loopback origins are only needed when the browser talks to a local Laravel
// (8001) or Expo (8100) backend in development. They are stripped from the
// production policy so a deployed build never whitelists plaintext http.
const devConnectSrc = isProduction
  ? []
  : ["http://127.0.0.1:8001", "http://localhost:8001", "http://127.0.0.1:8100", "http://localhost:8100"];
const devImgSrc = isProduction ? [] : ["http://127.0.0.1:8001", "http://localhost:8001"];

// 'unsafe-eval' is required by React Refresh / HMR in development only. The
// production bundle must not allow eval(); 'unsafe-inline' stays because Next
// emits inline hydration scripts without a nonce (a nonce migration is the
// next hardening step).
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  ...(isProduction ? [] : ["'unsafe-eval'"]),
  "https://va.vercel-scripts.com",
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  ["img-src 'self' data: blob: https:", ...devImgSrc].join(" "),
  [
    "connect-src 'self' https://api.identa.uz",
    ...devConnectSrc,
    "https://vitals.vercel-insights.com",
    "https://*.vercel-insights.com",
  ].join(" "),
  "frame-src 'self'",
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
          "/:path(login|register|forgot-password|reset-password|dashboard|patients|appointments|payments|billing|settings|staff|team|admin|api)(.*)",
        headers: noIndexHeaders,
      },
    ];
  },
};

export default nextConfig;
