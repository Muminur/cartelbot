"use client";

import * as React from "react";
import { Palette, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useThemePreset } from "@/components/providers/ThemeProvider";

interface AccentColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_COLORS = [
  { name: "Purple", value: "262 83% 68%", hex: "#a78bfa" },
  { name: "Blue", value: "217 91% 60%", hex: "#3b82f6" },
  { name: "Cyan", value: "193 43% 67%", hex: "#88c0d0" },
  { name: "Green", value: "142 76% 46%", hex: "#00d563" },
  { name: "Yellow", value: "45 100% 51%", hex: "#fbbf24" },
  { name: "Orange", value: "25 95% 53%", hex: "#f97316" },
  { name: "Red", value: "0 84% 70%", hex: "#ff3b69" },
  { name: "Pink", value: "330 81% 60%", hex: "#ec4899" },
];

export function AccentColorPicker({ open, onOpenChange }: AccentColorPickerProps) {
  const { accentColor, setAccentColor } = useThemePreset();
  const [customColor, setCustomColor] = React.useState("");

  const handlePresetColor = (color: string) => {
    setAccentColor(color);
    setCustomColor("");
  };

  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setCustomColor(hex);

    // Convert hex to HSL
    if (hex.match(/^#[0-9A-F]{6}$/i)) {
      const hsl = hexToHSL(hex);
      setAccentColor(hsl);
    }
  };

  const handleReset = () => {
    setAccentColor(null);
    setCustomColor("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Custom Accent Color
          </DialogTitle>
          <DialogDescription>
            Choose a preset color or enter a custom hex value. This will change
            the primary color used throughout the interface in dark mode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preset Colors */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Preset Colors</Label>
            <div className="grid grid-cols-4 gap-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handlePresetColor(color.value)}
                  className={`group relative aspect-square rounded-lg transition-all hover:scale-110 ${
                    accentColor === color.value
                      ? "ring-2 ring-offset-2 ring-primary"
                      : ""
                  }`}
                  style={{ backgroundColor: color.hex }}
                  aria-label={`Select ${color.name}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-medium text-white drop-shadow-md">
                      {color.name}
                    </span>
                  </span>
                  {accentColor === color.value && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white text-xl">✓</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Color Input */}
          <div className="space-y-3">
            <Label htmlFor="custom-color" className="text-sm font-medium">
              Custom Color (Hex)
            </Label>
            <div className="flex gap-2">
              <Input
                id="custom-color"
                type="text"
                placeholder="#a78bfa"
                value={customColor}
                onChange={handleCustomColor}
                className="font-mono"
                maxLength={7}
              />
              <div
                className="w-12 h-10 rounded border-2 border-border"
                style={{
                  backgroundColor: customColor || "#64748b",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a 6-digit hex color code (e.g., #a78bfa)
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Convert hex color to HSL format for CSS variables
 */
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace("#", "");

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  const lValue = Math.round(l * 100);

  return `${h} ${s}% ${lValue}%`;
}
