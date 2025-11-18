"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NAVIGATION_ITEMS } from "@/lib/constants/navigation";

interface MobileSidebarProps {
  onNavigate?: () => void;
}

export function MobileSidebar({ onNavigate }: MobileSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNavigate = (href: string) => {
    router.push(href);
    onNavigate?.(); // Close mobile menu after navigation
  };

  return (
    <div className="h-full bg-white dark:bg-card transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-border">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 dark:from-purple-600 dark:to-purple-800 rounded-full flex items-center justify-center">
            <span className="text-sm font-bold text-white">CB</span>
          </div>
          <span className="text-lg font-bold text-foreground">Menu</span>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="p-4 space-y-1" role="navigation" aria-label="Main navigation">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.name}
              onClick={() => handleNavigate(item.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-accent active:bg-gray-100 dark:active:bg-accent/80"
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
