"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";

/**
 * Page-specific theme configuration
 * Maps routes to preferred themes
 */
const PAGE_THEMES: Record<string, "light" | "dark" | undefined> = {
  "/login": "dark",           // Login page always dark for dramatic effect
  "/verify": "dark",          // Verification page always dark
  "/signals": undefined,      // Signals page uses user preference
  "/trades": undefined,       // Trades page uses user preference
  "/dashboard": undefined,    // Dashboard uses user preference
  "/portfolio": undefined,    // Portfolio uses user preference
  "/settings": undefined,     // Settings uses user preference
  "/oco": undefined,          // OCO page uses user preference
};

/**
 * usePageTheme Hook
 *
 * Automatically applies page-specific theme overrides while preserving
 * user's global theme preference for other pages.
 *
 * Usage:
 * ```tsx
 * function MyPage() {
 *   usePageTheme(); // Automatically applies page theme if configured
 *   return <div>...</div>
 * }
 * ```
 *
 * @param forceTheme - Optional: Force a specific theme for this page (overrides PAGE_THEMES)
 */
export function usePageTheme(
  forceTheme?: "light" | "dark"
): void {
  const { setTheme, theme: currentTheme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    // Priority: forceTheme prop > PAGE_THEMES config
    const pageTheme = forceTheme || PAGE_THEMES[pathname];

    if (pageTheme && currentTheme !== pageTheme) {
      // Save current theme to restore later
      const previousTheme = currentTheme;
      setTheme(pageTheme);

      // Restore previous theme on unmount
      return () => {
        if (previousTheme) {
          setTheme(previousTheme);
        }
      };
    }
  }, [pathname, forceTheme, setTheme, currentTheme]);
}

/**
 * usePageThemeClass Hook
 *
 * Returns className for page-specific theme styling without
 * changing the global theme.
 *
 * Usage:
 * ```tsx
 * function MyPage() {
 *   const themeClass = usePageThemeClass("dark");
 *   return <div className={themeClass}>...</div>
 * }
 * ```
 */
export function usePageThemeClass(
  theme?: "light" | "dark"
): string {
  const pathname = usePathname();
  const pageTheme = theme || PAGE_THEMES[pathname];

  if (!pageTheme) return "";

  return pageTheme === "dark" ? "dark" : "light";
}

/**
 * Get configured theme for a specific path
 */
export function getPageTheme(path: string): "light" | "dark" | undefined {
  return PAGE_THEMES[path];
}

/**
 * Set theme for a specific path (runtime configuration)
 */
export function setPageTheme(
  path: string,
  theme: "light" | "dark" | undefined
): void {
  PAGE_THEMES[path] = theme;
}
