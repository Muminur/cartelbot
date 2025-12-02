"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

interface TosWarningProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}

export function TosWarning({ open, onOpenChange, onAccept }: TosWarningProps) {
  const [understood, setUnderstood] = useState(false);

  const handleAccept = () => {
    if (understood) {
      onAccept();
      setUnderstood(false); // Reset for next time
    }
  };

  const handleCancel = () => {
    setUnderstood(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            CRITICAL WARNING - Discord Account Automation
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-foreground">
              <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 space-y-3">
                <p className="font-semibold text-destructive">
                  This feature uses Discord account automation which VIOLATES Discord&apos;s Terms of Service.
                </p>

                <div className="space-y-2 text-sm">
                  <p className="font-medium">By connecting your Discord account, you acknowledge:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Your Discord account may be PERMANENTLY BANNED</li>
                    <li>Discord actively detects and terminates accounts using automation</li>
                    <li>You may lose access to all servers, messages, and friends</li>
                    <li>CartelBot is not responsible for account suspension or data loss</li>
                    <li>This feature is provided AS-IS with no warranties</li>
                  </ul>
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="font-medium">We strongly recommend:</p>
                <ul className="list-disc list-inside space-y-1 text-sm ml-2">
                  <li>Use a separate Discord account (not your main account)</li>
                  <li>Only monitor public signal channels</li>
                  <li>Accept the risk of permanent account loss</li>
                  <li>Regularly backup important Discord data</li>
                </ul>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  <strong>Legal Disclaimer:</strong> Using this feature is at your own risk.
                  CartelBot and its developers are not liable for any consequences including
                  but not limited to account termination, data loss, or service disruption.
                </p>
              </div>

              <div className="flex items-start space-x-3 pt-2">
                <Checkbox
                  id="tos-accept"
                  checked={understood}
                  onCheckedChange={(checked) => setUnderstood(checked === true)}
                  aria-label="Accept Terms of Service"
                />
                <Label
                  htmlFor="tos-accept"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  I understand and accept these risks. I acknowledge that my Discord account
                  may be permanently banned and I accept full responsibility for this decision.
                </Label>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAccept}
            disabled={!understood}
            className="bg-destructive hover:bg-destructive/90"
          >
            I Accept the Risks
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
