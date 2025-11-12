"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Signal,
  TrendingUp,
  Settings,
  BarChart3,
  Wallet,
  Package
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Portfolio", href: "/portfolio", icon: Wallet },
  { name: "Signals", href: "/signals", icon: Signal },
  { name: "Trades", href: "/trades", icon: TrendingUp },
  { name: "Orphaned Coins", href: "/orphaned-coins", icon: Package },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className={cn("w-64 bg-white border-r min-h-screen", className)}>
      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-purple-50 text-purple-700"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
