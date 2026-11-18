const isProd = process.env.NODE_ENV === "production";

/** The origin (scheme + host + port) of a URL from the environment, or null if there isn't one. */
function originOf(value) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

// The page may talk to exactly these places: itself, the read API (data and token images) and the Starknet node
// it reads balances from. Anything else a script on the page tries to reach is refused by the browser.
const api = originOf(process.env.NEXT_PUBLIC_API_URL);
const rpc = originOf(process.env.NEXT_PUBLIC_RPC_URL);
const connect = ["'self'", api, rpc].filter(Boolean).join(" ");
const images = ["'self'", "data:", "blob:", api].filter(Boolean).join(" ");

// Next.js writes small inline scripts to start the page, so scripts need 'unsafe-inline' unless every page is
// rendered per request with a nonce. The rest is locked down: nothing can be framed, embedded as a plugin, have
// its <base> changed or post a form to another site. Development needs eval for hot reload; production does not.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${images}`,
  "font-src 'self' data:",
  `connect-src ${connect}${isProd ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // The app needs none of these browser features, so a script that got onto the page cannot use them either.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not announce which framework answers.
  poweredByHeader: false,
  // The web app is a workspace package; trace the monorepo root for output file tracing.
  outputFileTracingRoot: process.cwd() + "/../../",
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Answers from the AI routes can carry one person's data; never let a browser or proxy keep or share them.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
