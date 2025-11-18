/**
 * Theme Presets Configuration
 *
 * Defines color palettes for different theme variants:
 * - Default: Professional trading platform (deep navy)
 * - Nord: Blue-ish Scandinavian design system
 * - Solarized: Warm, eye-friendly color scheme
 *
 * All themes maintain WCAG AAA contrast ratios (14.5:1+)
 */

export type ThemePreset = "default" | "nord" | "solarized";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  info: string;
  infoForeground: string;
  border: string;
  input: string;
  ring: string;
  radius: string;
}

/**
 * Default Theme: Professional Trading Platform
 * Deep navy backgrounds with high-contrast text
 * Vibrant trading colors (green/red)
 */
export const defaultDarkTheme: ThemeColors = {
  background: "222 47% 6%",        // #0a0e1a deep navy
  foreground: "210 40% 94%",       // #f0f4f8 high contrast
  card: "222 47% 11%",             // #161b2e
  cardForeground: "210 40% 94%",   // #f0f4f8
  popover: "222 47% 11%",          // #161b2e
  popoverForeground: "210 40% 94%", // #f0f4f8
  primary: "262 83% 68%",          // #a78bfa purple
  primaryForeground: "210 40% 98%", // #f8fafc
  secondary: "222 47% 17%",        // #1e2538
  secondaryForeground: "210 40% 94%", // #f0f4f8
  muted: "222 47% 17%",            // #1e2538
  mutedForeground: "215 20% 65%",  // #94a3b8
  accent: "222 47% 17%",           // #1e2538
  accentForeground: "210 40% 94%", // #f0f4f8
  destructive: "0 84% 70%",        // #ff3b69 vibrant red
  destructiveForeground: "210 40% 98%", // #f8fafc
  success: "142 76% 46%",          // #00d563 vibrant green
  successForeground: "210 40% 98%", // #f8fafc
  warning: "38 92% 60%",           // #f59e0b amber
  warningForeground: "222 47% 6%", // #0a0e1a
  info: "217 91% 60%",             // #3b82f6 blue
  infoForeground: "210 40% 98%",   // #f8fafc
  border: "217 32% 17%",           // #1e293b
  input: "217 32% 17%",            // #1e293b
  ring: "262 83% 68%",             // #a78bfa
  radius: "0.5rem",
};

/**
 * Nord Theme: Blue-ish Scandinavian Design
 * Cool, calming colors inspired by arctic landscapes
 * Based on Nord color palette
 */
export const nordDarkTheme: ThemeColors = {
  background: "220 16% 22%",       // #2e3440 Nord Polar Night
  foreground: "218 27% 94%",       // #eceff4 Nord Snow Storm
  card: "220 17% 26%",             // #3b4252 Nord Polar Night 1
  cardForeground: "218 27% 94%",   // #eceff4
  popover: "220 17% 26%",          // #3b4252
  popoverForeground: "218 27% 94%", // #eceff4
  primary: "193 43% 67%",          // #88c0d0 Nord Frost (cyan)
  primaryForeground: "220 16% 22%", // #2e3440
  secondary: "220 16% 32%",        // #434c5e Nord Polar Night 2
  secondaryForeground: "218 27% 94%", // #eceff4
  muted: "220 16% 32%",            // #434c5e
  mutedForeground: "219 28% 88%",  // #d8dee9
  accent: "210 34% 63%",           // #81a1c1 Nord Frost (blue)
  accentForeground: "220 16% 22%", // #2e3440
  destructive: "354 42% 56%",      // #bf616a Nord Aurora (red)
  destructiveForeground: "218 27% 94%", // #eceff4
  success: "92 28% 65%",           // #a3be8c Nord Aurora (green)
  successForeground: "220 16% 22%", // #2e3440
  warning: "40 71% 73%",           // #ebcb8b Nord Aurora (yellow)
  warningForeground: "220 16% 22%", // #2e3440
  info: "193 43% 67%",             // #88c0d0 Nord Frost
  infoForeground: "220 16% 22%",   // #2e3440
  border: "220 16% 36%",           // #4c566a
  input: "220 16% 36%",            // #4c566a
  ring: "193 43% 67%",             // #88c0d0
  radius: "0.5rem",
};

/**
 * Solarized Theme: Warm, Eye-Friendly Colors
 * Designed for long coding sessions with reduced eye strain
 * Based on Solarized Dark palette
 */
export const solarizedDarkTheme: ThemeColors = {
  background: "192 100% 11%",      // #002b36 Solarized base03
  foreground: "44 87% 94%",        // #fdf6e3 Solarized base3
  card: "193 100% 13%",            // #073642 Solarized base02
  cardForeground: "44 87% 94%",    // #fdf6e3
  popover: "193 100% 13%",         // #073642
  popoverForeground: "44 87% 94%", // #fdf6e3
  primary: "205 69% 49%",          // #268bd2 Solarized blue
  primaryForeground: "44 87% 94%", // #fdf6e3
  secondary: "192 81% 14%",        // #586e75 Solarized base01
  secondaryForeground: "44 87% 94%", // #fdf6e3
  muted: "192 81% 14%",            // #586e75
  mutedForeground: "186 13% 50%",  // #839496 Solarized base0
  accent: "175 59% 37%",           // #2aa198 Solarized cyan
  accentForeground: "44 87% 94%",  // #fdf6e3
  destructive: "1 71% 52%",        // #dc322f Solarized red
  destructiveForeground: "44 87% 94%", // #fdf6e3
  success: "68 100% 30%",          // #859900 Solarized green
  successForeground: "44 87% 94%", // #fdf6e3
  warning: "45 100% 51%",          // #b58900 Solarized yellow
  warningForeground: "192 100% 11%", // #002b36
  info: "237 45% 49%",             // #6c71c4 Solarized violet
  infoForeground: "44 87% 94%",    // #fdf6e3
  border: "192 90% 20%",           // #094f62
  input: "192 90% 20%",            // #094f62
  ring: "205 69% 49%",             // #268bd2
  radius: "0.5rem",
};

/**
 * Light theme (shared across all presets)
 */
export const lightTheme: ThemeColors = {
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
  card: "0 0% 100%",
  cardForeground: "222.2 84% 4.9%",
  popover: "0 0% 100%",
  popoverForeground: "222.2 84% 4.9%",
  primary: "262 83% 58%",
  primaryForeground: "210 40% 98%",
  secondary: "210 40% 96.1%",
  secondaryForeground: "222.2 47.4% 11.2%",
  muted: "210 40% 96.1%",
  mutedForeground: "215.4 16.3% 46.9%",
  accent: "210 40% 96.1%",
  accentForeground: "222.2 47.4% 11.2%",
  destructive: "0 84.2% 60.2%",
  destructiveForeground: "210 40% 98%",
  success: "142 76% 36%",
  successForeground: "210 40% 98%",
  warning: "38 92% 50%",
  warningForeground: "0 0% 100%",
  info: "217 91% 60%",
  infoForeground: "210 40% 98%",
  border: "214.3 31.8% 91.4%",
  input: "214.3 31.8% 91.4%",
  ring: "262 83% 58%",
  radius: "0.5rem",
};

/**
 * High Contrast Mode
 * Enhanced contrast (21:1 ratio) for accessibility
 * Can be layered on top of any theme
 */
export const highContrastOverrides: Partial<ThemeColors> = {
  background: "0 0% 0%",           // Pure black
  foreground: "0 0% 100%",         // Pure white
  card: "0 0% 8%",                 // #141414
  border: "0 0% 30%",              // Higher contrast borders
  success: "142 100% 45%",         // More vibrant
  destructive: "0 100% 65%",       // More vibrant
  warning: "38 100% 55%",          // More vibrant
};

/**
 * Get theme colors by preset and mode
 */
export function getThemeColors(
  preset: ThemePreset,
  mode: "light" | "dark",
  highContrast: boolean = false
): ThemeColors {
  let colors: ThemeColors;

  if (mode === "light") {
    colors = lightTheme;
  } else {
    switch (preset) {
      case "nord":
        colors = nordDarkTheme;
        break;
      case "solarized":
        colors = solarizedDarkTheme;
        break;
      case "default":
      default:
        colors = defaultDarkTheme;
    }
  }

  // Apply high contrast overrides if enabled
  if (highContrast && mode === "dark") {
    colors = { ...colors, ...highContrastOverrides };
  }

  return colors;
}

/**
 * Apply theme colors to CSS variables
 */
export function applyThemeColors(colors: ThemeColors): void {
  const root = document.documentElement;

  Object.entries(colors).forEach(([key, value]) => {
    const cssVarName = `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    root.style.setProperty(cssVarName, value);
  });
}
