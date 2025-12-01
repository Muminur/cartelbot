import TradesClient from "./TradesClient";

// Force dynamic rendering to prevent Next.js 16 Turbopack prerendering bug
export const dynamic = "force-dynamic";

export default function Page() {
  return <TradesClient />;
}
