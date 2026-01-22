/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: [
    "mongoose",
    // Discord selfbot packages - externalize to avoid ffmpeg-static/prism-media build errors
    // These are only used server-side for message monitoring (no voice features)
    "discord.js-selfbot-v13",
    "prism-media",
    "ffmpeg-static",
  ],
  // NOTE: standalone output disabled on Windows due to Next.js 16 Turbopack bug
  // (EINVAL: Windows can't handle colons in filenames like [externals]_node:inspector_*.js)
  // Re-enable for Docker/Linux deployment: output: "standalone",
  // output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  // Workaround for Next.js 16 Turbopack prerendering bug with global-error
  // The error doesn't affect runtime, only build-time static generation
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Skip static generation for admin pages due to Next.js 16 Turbopack bug
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  // Known issue: Next.js 16.0.1 Turbopack has a bug with global-error prerendering when using context providers
  // This causes build errors: "TypeError: Cannot read properties of null (reading 'useContext')"
  // Workaround: The app functions correctly at runtime despite build error
  // Official fix expected in Next.js 16.1+
  // Issue: https://github.com/vercel/next.js/issues/71638
  experimental: {
    // Disable problematic prerendering optimizations
    workerThreads: false,
    cpus: 1,
    optimizePackageImports: [
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@tanstack/react-table",
      "lucide-react",
      "recharts",
    ],
  },
  // Increase static page generation timeout for problematic pages
  staticPageGenerationTimeout: 120,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-DNS-Prefetch-Control",
          value: "on",
        },
        {
          key: "X-Frame-Options",
          value: "DENY",
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
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "X-XSS-Protection",
          value: "1; mode=block",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: https:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self' https://api.binance.com https://testnet.binance.vision wss://stream.binance.com:9443 wss://stream.testnet.binance.vision:9443 https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com",
            "worker-src 'self' blob: https://cdn.jsdelivr.net",
            "child-src 'self' blob:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
        {
          key: "X-Permitted-Cross-Domain-Policies",
          value: "none",
        },
        {
          key: "Cross-Origin-Embedder-Policy",
          value: "require-corp",
        },
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin",
        },
        {
          key: "Cross-Origin-Resource-Policy",
          value: "same-origin",
        },
      ],
    },
  ],
};

export default nextConfig;
