"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";

interface AccountBalance {
  asset: string;
  free: string;
  locked: string;
}

export function AccountBalanceWidget() {
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        } else {
          setError(data.error?.message || data.error || "Failed to fetch balances");
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
        setError("Failed to fetch balances");
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500 text-center py-4">{error}</p>
        </CardContent>
      </Card>
    );
  }

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
          <p className="text-sm text-gray-500 text-center py-4">
            No balances available
          </p>
        ) : (
          <div className="space-y-3">
            {balances.map((balance) => (
              <div
                key={balance.asset}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div>
                  <p className="font-medium">{balance.asset}</p>
                  <p className="text-xs text-gray-500">Available</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {formatCurrency(parseFloat(balance.free))}
                  </p>
                  {parseFloat(balance.locked) > 0 && (
                    <p className="text-xs text-gray-500">
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
