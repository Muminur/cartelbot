"use client";

import * as React from "react";
import { Clock, Sun, Moon } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useThemePreset } from "@/components/providers/ThemeProvider";

interface AutoSwitchSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AutoSwitchSettings({
  open,
  onOpenChange,
}: AutoSwitchSettingsProps) {
  const {
    autoSwitch,
    setAutoSwitch,
    autoSwitchTime,
    setAutoSwitchTime,
  } = useThemePreset();

  const [dayTime, setDayTime] = React.useState(autoSwitchTime.day);
  const [nightTime, setNightTime] = React.useState(autoSwitchTime.night);

  const handleSave = () => {
    setAutoSwitchTime({ day: dayTime, night: nightTime });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Auto-Switch Settings
          </DialogTitle>
          <DialogDescription>
            Automatically switch between light and dark themes based on time of
            day. The theme will change at the specified times.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Enable Auto-Switch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Enable Auto-Switch</Label>
              <p className="text-xs text-muted-foreground">
                Automatically switch themes based on time
              </p>
            </div>
            <Switch checked={autoSwitch} onCheckedChange={setAutoSwitch} />
          </div>

          {/* Day Time Setting */}
          <div className="space-y-3">
            <Label htmlFor="day-time" className="text-sm font-medium flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" />
              Switch to Light Mode
            </Label>
            <Input
              id="day-time"
              type="time"
              value={dayTime}
              onChange={(e) => setDayTime(e.target.value)}
              disabled={!autoSwitch}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Default: 06:00 (6:00 AM)
            </p>
          </div>

          {/* Night Time Setting */}
          <div className="space-y-3">
            <Label htmlFor="night-time" className="text-sm font-medium flex items-center gap-2">
              <Moon className="h-4 w-4 text-indigo-500" />
              Switch to Dark Mode
            </Label>
            <Input
              id="night-time"
              type="time"
              value={nightTime}
              onChange={(e) => setNightTime(e.target.value)}
              disabled={!autoSwitch}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Default: 18:00 (6:00 PM)
            </p>
          </div>

          {/* Preview */}
          {autoSwitch && (
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Schedule Preview</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Sun className="h-3 w-3 text-amber-500" />
                  Light mode: {dayTime} - {nightTime}
                </p>
                <p className="flex items-center gap-2">
                  <Moon className="h-3 w-3 text-indigo-500" />
                  Dark mode: {nightTime} - {dayTime}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
