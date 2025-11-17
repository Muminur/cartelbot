import {
  LayoutDashboard,
  Signal,
  TrendingUp,
  Settings,
  BarChart3,
  Wallet,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Portfolio", href: "/portfolio", icon: Wallet },
  { name: "Signals", href: "/signals", icon: Signal },
  { name: "Trades", href: "/trades", icon: TrendingUp },
  { name: "Orphaned Coins", href: "/orphaned-coins", icon: Package },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];
