"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface TestConnectionButtonProps {
  hasApiKeys: boolean;
}

export function TestConnectionButton({ hasApiKeys }: TestConnectionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    balance?: string;
    canTrade?: boolean;
    error?: string;
  } | null>(null);

  const handleTest = async () => {
    if (!hasApiKeys) {
      toast.error("No API keys configured", {
        description: "Please save your API keys first before testing connection.",
      });
      return;
    }

    setIsLoading(true);
    setDialogOpen(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/binance/account");
      const result = await response.json();

      if (!response.ok || !result.success) {
        setTestResult({
          success: false,
          error: result.error || "Failed to connect to Binance",
        });
        return;
      }

      const usdtBalance = result.data.balances.find(
        (b: { asset: string; free: string }) => b.asset === "USDT"
      );

      setTestResult({
        success: true,
        balance: usdtBalance?.free || "0.00",
        canTrade: result.data.canTrade,
      });
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Network error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleTest}
        disabled={!hasApiKeys || isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testing...
          </>
        ) : (
          "Test Connection"
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Binance API Connection Test</DialogTitle>
            <DialogDescription>
              Testing connection to Binance with your API keys
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            )}

            {testResult && testResult.success && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Connection Successful!</span>
                </div>
                <div className="space-y-2 rounded-lg bg-green-50 p-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">USDT Balance:</span>
                    <span className="font-semibold">{testResult.balance} USDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Can Trade:</span>
                    <span className="font-semibold">
                      {testResult.canTrade ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {testResult && !testResult.success && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-semibold">Connection Failed</span>
                </div>
                <div className="rounded-lg bg-red-50 p-4">
                  <p className="text-sm text-red-900">{testResult.error}</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold mb-2">Common issues:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Invalid API key or secret</li>
                    <li>IP address not whitelisted on Binance</li>
                    <li>API key permissions not configured correctly</li>
                    <li>Network connectivity issues</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
