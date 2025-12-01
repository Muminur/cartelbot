import SignalsClient from "./SignalsClient";

// Force dynamic rendering to prevent Next.js 16 Turbopack prerendering bug
export const dynamic = "force-dynamic";

export default function AdminSignalsPage() {
  return <SignalsClient />;
}
