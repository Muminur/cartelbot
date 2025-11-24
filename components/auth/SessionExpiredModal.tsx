"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface SessionExpiredModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function SessionExpiredModal({ isOpen, onClose }: SessionExpiredModalProps) {
  const router = useRouter();
  const [returnUrl, setReturnUrl] = useState<string>("/dashboard");

  useEffect(() => {
    // Capture current path to return after re-authentication
    if (typeof window !== "undefined") {
      setReturnUrl(window.location.pathname);
    }
  }, []);

  const handleSignIn = () => {
    // Clear any existing session data
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    // Redirect to login with return URL
    const returnPath = returnUrl !== "/login" ? returnUrl : "/dashboard";
    router.push(`/login?returnUrl=${encodeURIComponent(returnPath)}`);

    onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/20">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-xl">Session Expired</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Your session has expired for security reasons. Please sign in again to continue using CartelBot.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleSignIn} className="w-full sm:w-auto">
            Sign In Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
