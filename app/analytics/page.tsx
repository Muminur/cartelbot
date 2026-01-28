"use client";

import nextDynamic from "next/dynamic";

// PERF: Lazy load AnalyticsClient to defer ~47KB Recharts bundle
const AnalyticsClient = nextDynamic(() => import("./AnalyticsClient"), {
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div
        className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"
        role="status"
        aria-label="Loading analytics"
      />
    </div>
  ),
  ssr: false,
});

export default function Page() {
  return <AnalyticsClient />;
}
