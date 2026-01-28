"use client";

import { useEffect, useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Settings, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import Link from "next/link";

interface AccountBalance {
  asset: string;
  free: string;
  locked: string;
}

interface ErrorResponse {
  message: string;
  code?: string;
  requiresSetup?: boolean;
  binanceCode?: number;
}

function AccountBalanceWidget() {
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorResponse | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch("/api/binance/account");
        const data = await response.json();

        if (data.success && data.data.balances) {
          const filteredBalances = data.data.balances
            .filter((b: AccountBalance) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
            .slice(0, 5);
          setBalances(filteredBalances);
          setError(null);
        } else {
          // Parse error response
          const errorData: ErrorResponse = {
            message: data.error?.message || data.error || "Failed to fetch balances",
            code: data.error?.code,
            requiresSetup: data.error?.requiresSetup || false,
            binanceCode: data.error?.binanceCode,
          };
          setError(errorData);
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
        setError({
          message: "Network error while fetching balances. Please check your connection.",
          code: "NETWORK_ERROR",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle "No API keys configured" scenario with helpful prompt
  if (error?.code === "NO_API_KEYS" || error?.requiresSetup) {
    return (
      <Card className="border-yellow-200 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <p className="text-sm text-foreground mb-4">
              {error.message}
            </p>
            <Link href="/settings">
              <Button variant="default" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                Configure API Keys
              </Button>
            </Link>
            {error.binanceCode === -2015 && (
              <div className="mt-4 text-xs text-muted-foreground bg-white dark:bg-gray-800 p-3 rounded border border-yellow-200 dark:border-yellow-700">
                <p className="font-semibold mb-1 text-foreground">Common Binance API Error -2015 Causes:</p>
                <ul className="list-disc text-left pl-5 space-y-1">
                  <li>API key or secret is incorrect</li>
                  <li>Server IP not whitelisted on Binance</li>
                  <li>Spot & Margin Trading permission not enabled</li>
                  <li>Using testnet keys with mainnet (or vice versa)</li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle other errors (invalid keys, network issues, etc.)
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-red-600 dark:text-red-500" />
            Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-sm text-red-700 dark:text-red-400 mb-3">{error.message}</p>
            {error.code === "INVALID_API_KEYS" || error.code === "INVALID_SIGNATURE" ? (
              <Link href="/settings">
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Update API Keys
                </Button>
              </Link>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success state - show balances
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Account Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {balances.length === 0 ? (
          <div className="text-center py-6">
            <Wallet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No balances available
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Deposit funds to your Binance account to start trading
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {balances.map((balance) => (
              <div
                key={balance.asset}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div>
                  <p className="font-medium text-foreground">{balance.asset}</p>
                  <p className="text-xs text-muted-foreground">Available</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-foreground">
                    {formatCurrency(parseFloat(balance.free))}
                  </p>
                  {parseFloat(balance.locked) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Locked: {formatCurrency(parseFloat(balance.locked))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(AccountBalanceWidget);
