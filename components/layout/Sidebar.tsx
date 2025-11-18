"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NAVIGATION_ITEMS } from "@/lib/constants/navigation";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className={cn("w-64 bg-white dark:bg-card border-r dark:border-border min-h-screen transition-colors", className)}>
      <nav className="p-4 space-y-1" role="navigation" aria-label="Main navigation">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              aria-current={isActive ? "page" : undefined}
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
    </div>
  );
}
