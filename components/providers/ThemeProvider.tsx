"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  ThemePreset,
  getThemeColors,
  applyThemeColors,
} from "@/lib/themes/presets";

/**
 * Theme Context with Advanced Features
 * - Theme presets (Default, Nord, Solarized)
 * - Custom accent colors
 * - High contrast mode
 * - Time-based auto-switching
 * - Per-page theme overrides
 */
interface ThemeContextType {
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
  accentColor: string | null;
  setAccentColor: (color: string | null) => void;
  highContrast: boolean;
  setHighContrast: (enabled: boolean) => void;
  autoSwitch: boolean;
  setAutoSwitch: (enabled: boolean) => void;
  autoSwitchTime: { day: string; night: string };
  setAutoSwitchTime: (time: { day: string; night: string }) => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(
  undefined
);

export function useThemePreset() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemePreset must be used within ThemeProvider");
  }
  return context;
}

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class" | "data-theme" | "data-mode";
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Theme preset state (default, nord, solarized)
  const [preset, setPresetState] = React.useState<ThemePreset>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme-preset") as ThemePreset) || "default";
    }
    return "default";
  });

  // Custom accent color
  const [accentColor, setAccentColorState] = React.useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("accent-color");
    }
    return null;
  });

  // High contrast mode
  const [highContrast, setHighContrastState] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("high-contrast") === "true";
    }
    return false;
  });

  // Auto-switch based on time of day
  const [autoSwitch, setAutoSwitchState] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auto-switch") === "true";
    }
    return false;
  });

  // Auto-switch time settings (24-hour format)
  const [autoSwitchTime, setAutoSwitchTimeState] = React.useState<{
    day: string;
    night: string;
  }>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("auto-switch-time");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (error) {
          console.error('[ThemeProvider] Failed to parse auto-switch-time from localStorage:', error);
          // Return default if parse fails
          return { day: "06:00", night: "18:00" };
        }
      }
    }
    return { day: "06:00", night: "18:00" };
  });

  // Persist preset to localStorage
  const setPreset = React.useCallback((newPreset: ThemePreset) => {
    setPresetState(newPreset);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme-preset", newPreset);
    }
  }, []);

  // Persist accent color to localStorage
  const setAccentColor = React.useCallback((color: string | null) => {
    setAccentColorState(color);
    if (typeof window !== "undefined") {
      if (color) {
        localStorage.setItem("accent-color", color);
      } else {
        localStorage.removeItem("accent-color");
      }
    }
  }, []);

  // Persist high contrast to localStorage
  const setHighContrast = React.useCallback((enabled: boolean) => {
    setHighContrastState(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("high-contrast", enabled.toString());
    }
  }, []);

  // Persist auto-switch to localStorage
  const setAutoSwitch = React.useCallback((enabled: boolean) => {
    setAutoSwitchState(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("auto-switch", enabled.toString());
    }
  }, []);

  // Persist auto-switch time to localStorage
  const setAutoSwitchTime = React.useCallback(
    (time: { day: string; night: string }) => {
      setAutoSwitchTimeState(time);
      if (typeof window !== "undefined") {
        localStorage.setItem("auto-switch-time", JSON.stringify(time));
      }
    },
    []
  );

  // Apply theme colors when preset or mode changes
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const applyTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      const mode = isDark ? "dark" : "light";
      const colors = getThemeColors(preset, mode, highContrast);
      applyThemeColors(colors);

      // Apply custom accent color if set
      if (accentColor && isDark) {
        document.documentElement.style.setProperty("--primary", accentColor);
      }
    };

    // Initial application
    applyTheme();

    // Watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class"
        ) {
          applyTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [preset, highContrast, accentColor]);

  // Auto-switch theme based on time of day
  React.useEffect(() => {
    if (!autoSwitch || typeof window === "undefined") return;

    const checkTime = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;

      const [dayHour, dayMinute] = autoSwitchTime.day.split(":").map(Number);
      const [nightHour, nightMinute] = autoSwitchTime.night
        .split(":")
        .map(Number);

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const dayMinutes = dayHour * 60 + dayMinute;
      const nightMinutes = nightHour * 60 + nightMinute;

      const isDark = document.documentElement.classList.contains("dark");

      // Switch to light mode during day hours
      if (
        currentMinutes >= dayMinutes &&
        currentMinutes < nightMinutes &&
        isDark
      ) {
        document.documentElement.classList.remove("dark");
      }
      // Switch to dark mode during night hours
      else if (
        (currentMinutes >= nightMinutes || currentMinutes < dayMinutes) &&
        !isDark
      ) {
        document.documentElement.classList.add("dark");
      }
    };

    // Check immediately
    checkTime();

    // Check every minute
    const interval = setInterval(checkTime, 60000);

    return () => clearInterval(interval);
  }, [autoSwitch, autoSwitchTime]);

  const value: ThemeContextType = {
    preset,
    setPreset,
    accentColor,
    setAccentColor,
    highContrast,
    setHighContrast,
    autoSwitch,
    setAutoSwitch,
    autoSwitchTime,
    setAutoSwitchTime,
  };

  return (
    <ThemeContext.Provider value={value}>
      <NextThemesProvider {...props}>{children}</NextThemesProvider>
    </ThemeContext.Provider>
  );
}
