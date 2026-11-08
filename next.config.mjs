/** @type {import('next').NextConfig} */

// Content-Security-Policy, shipped in Report-Only mode first: it does NOT block
// anything, it only surfaces violations (browser console) so the policy can be
// tuned before enforcement. The main value today is restricting where the app
// may connect (self + Supabase), limiting data-exfiltration channels; the
// remaining step to enforcement is nonce-based script-src via middleware
// (tracked in docs/PRODUCTION_READINESS.md). 'unsafe-inline' is allowed for now
// because Next.js injects inline bootstrap scripts and React inlines styles.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Razorpay Checkout (UPI fee payments) runs in an iframe from these hosts.
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.razorpay.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // HSTS is honored only over HTTPS (production); harmless on localhost.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Uploads are posted to server actions. 4,262,144 bytes = the 4,000,000
    // byte file budget per request + a 256 KiB multipart reserve, kept below
    // Vercel's 4.5 MB request-body limit. Must equal
    // SERVER_ACTION_BODY_LIMIT_BYTES in lib/uploads/limits.ts (unit-tested).
    serverActions: { bodySizeLimit: 4_262_144 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
