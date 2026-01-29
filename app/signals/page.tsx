import SignalsPageClient from "./SignalsPageClient";

// Force dynamic rendering to prevent Next.js 16 Turbopack prerendering bug
export const dynamic = "force-dynamic";

export default function Page() {
  // SignalsPageClient now handles its own Suspense wrapper for useSearchParams
  return <SignalsPageClient />;
}
