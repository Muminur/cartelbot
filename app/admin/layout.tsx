"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { API_ROUTES } from "@/lib/constants";
import {
  LayoutDashboard,
  Users,
  Activity,
  Radio,
  CreditCard,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const ADMIN_NAV_ITEMS = [
  { name: "Overview", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "System", href: "/admin/system", icon: Activity },
  { name: "Signals", href: "/admin/signals", icon: Radio },
  { name: "Subscriptions", href: "/admin/subscriptions", icon: CreditCard },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await fetch(API_ROUTES.AUTH.SESSION);
        const data = await response.json();

        if (!data.success || !data.data.user) {
          router.push("/login");
          return;
        }

        // Verify admin access by attempting to call an admin endpoint
        const adminCheckResponse = await fetch("/api/admin/system/health");

        if (!adminCheckResponse.ok) {
          // User is not an admin, redirect to dashboard
          console.warn("Admin access denied - redirecting to dashboard");
          router.push("/dashboard");
          return;
        }

        setAuthorized(true);
      } catch (error) {
        console.error("Admin auth check failed:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background transition-colors">
      <div className="flex">
        {/* Admin Sidebar */}
        <div className="w-64 bg-white dark:bg-card border-r dark:border-border min-h-screen transition-colors">
          <div className="p-6 border-b dark:border-border">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Admin Panel</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">CartelBot Management</p>
          </div>
          <nav className="p-4 space-y-1">
            {ADMIN_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-accent"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t dark:border-border mt-auto">
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <main className="p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
