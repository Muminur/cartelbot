"use client";

import * as React from "react";
import { Moon, Sun, Settings, Palette, Clock, Eye } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useThemePreset } from "@/components/providers/ThemeProvider";
import { ThemePreset } from "@/lib/themes/presets";
import { AccentColorPicker } from "./AccentColorPicker";
import { AutoSwitchSettings } from "./AutoSwitchSettings";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const {
    preset,
    setPreset,
    highContrast,
    setHighContrast,
    autoSwitch,
    setAutoSwitch,
  } = useThemePreset();

  const [showAccentPicker, setShowAccentPicker] = React.useState(false);
  const [showAutoSwitch, setShowAutoSwitch] = React.useState(false);

  const presetLabels: Record<ThemePreset, string> = {
    default: "Default (Professional)",
    nord: "Nord (Blue-ish)",
    solarized: "Solarized (Warm)",
  };

  const presetDescriptions: Record<ThemePreset, string> = {
    default: "Deep navy with high contrast",
    nord: "Cool Scandinavian colors",
    solarized: "Eye-friendly warm tones",
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="relative">
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-semibold">
            Theme Mode
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Settings className="mr-2 h-4 w-4" />
            System
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="font-semibold">
            Dark Theme Preset
          </DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>{presetLabels[preset]}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {(["default", "nord", "solarized"] as ThemePreset[]).map((p) => (
                <DropdownMenuItem
                  key={p}
                  onClick={() => setPreset(p)}
                  className="flex flex-col items-start"
                >
                  <div className="flex items-center w-full">
                    <div
                      className={`w-3 h-3 rounded-full mr-2 ${
                        p === "default"
                          ? "bg-purple-500"
                          : p === "nord"
                          ? "bg-cyan-500"
                          : "bg-blue-500"
                      }`}
                    />
                    <span className="font-medium">{presetLabels[p]}</span>
                    {p === preset && (
                      <span className="ml-auto text-green-500">✓</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground ml-5">
                    {presetDescriptions[p]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="font-semibold">
            Advanced Options
          </DropdownMenuLabel>

          <DropdownMenuItem onClick={() => setShowAccentPicker(true)}>
            <Palette className="mr-2 h-4 w-4" />
            Custom Accent Color
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setShowAutoSwitch(true)}>
            <Clock className="mr-2 h-4 w-4" />
            Auto-Switch Settings
            {autoSwitch && (
              <span className="ml-auto text-xs text-green-500">ON</span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setHighContrast(!highContrast)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center">
              <Eye className="mr-2 h-4 w-4" />
              High Contrast Mode
            </div>
            {highContrast && (
              <span className="ml-auto text-green-500">✓</span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AccentColorPicker
        open={showAccentPicker}
        onOpenChange={setShowAccentPicker}
      />

      <AutoSwitchSettings
        open={showAutoSwitch}
        onOpenChange={setShowAutoSwitch}
      />
    </>
  );
}
