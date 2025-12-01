import { AccountForm } from "./AccountForm";

// Force dynamic rendering (skip static generation)
export const dynamic = "force-dynamic";

export default function AdminAccountPage() {
  return <AccountForm />;
}
