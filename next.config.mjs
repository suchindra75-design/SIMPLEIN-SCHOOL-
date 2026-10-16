/** @type {import('next').NextConfig} */
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
