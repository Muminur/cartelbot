"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, ExternalLink, AlertCircle } from "lucide-react";

interface DeleteResultData {
  success: boolean;
  choice: "sell" | "keep";
  quantity: string;
  symbol: string;
  message: string;
  sellOrderId?: string;
  orphanedCoinId?: string;
  ocoCount: number;
}

export default function DeleteResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [resultData, setResultData] = useState<DeleteResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUserAndParams = async () => {
      try {
        // Fetch user session for layout
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          setUserEmail(sessionData.data?.user?.email || "");
        }

        // Parse URL parameters
        const success = searchParams.get("success") === "true";
        const choice = searchParams.get("choice") as "sell" | "keep" | null;
        const quantity = searchParams.get("quantity");
        const symbol = searchParams.get("symbol");
        const message = searchParams.get("message");
        const sellOrderId = searchParams.get("sellOrderId");
        const orphanedCoinId = searchParams.get("orphanedCoinId");
        const ocoCount = parseInt(searchParams.get("ocoCount") || "0", 10);

        // Validate required parameters
        if (!success || !choice || !quantity || !symbol || !message) {
          setError(
            "Missing required parameters. Please delete a signal to view results."
          );
          setLoading(false);
          return;
        }

        // Validate symbol format (uppercase letters/numbers only, 2-10 chars)
        const symbolRegex = /^[A-Z0-9]{2,10}$/;
        if (!symbolRegex.test(symbol)) {
          setError("Invalid symbol format");
          setLoading(false);
          return;
        }

        // Validate quantity is a valid number
        const quantityNum = parseFloat(quantity);
        if (isNaN(quantityNum) || quantityNum <= 0 || quantity.length > 20) {
          setError("Invalid quantity value");
          setLoading(false);
          return;
        }

        // Validate choice is exactly "sell" or "keep"
        if (choice !== "sell" && choice !== "keep") {
          setError("Invalid choice parameter");
          setLoading(false);
          return;
        }

        // Store parsed data
        setResultData({
          success,
          choice,
          quantity,
          symbol,
          message,
          sellOrderId: sellOrderId || undefined,
          orphanedCoinId: orphanedCoinId || undefined,
          ocoCount,
        });
      } catch (err) {
        console.error("Error loading result data:", err);
        setError("Failed to load deletion results.");
      } finally {
        setLoading(false);
      }
    };

    loadUserAndParams();
  }, [searchParams]);

  const handleBackToSignals = () => {
    router.push("/signals/history");
  };

  const handleViewOrphanedCoins = () => {
    router.push("/orphaned-coins");
  };

  // Loading state
  if (loading) {
    return (
      <DashboardLayout userEmail={userEmail}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error || !resultData) {
    return (
      <DashboardLayout userEmail={userEmail}>
        <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
          <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            No Results Found
          </h2>
          <p className="text-gray-600 text-center mb-6 max-w-md">
            {error ||
              "We couldn't find any deletion results. This page is only accessible after deleting a signal."}
          </p>
          <Button onClick={handleBackToSignals}>Go to Signal History</Button>
        </div>
      </DashboardLayout>
    );
  }

  const isSellChoice = resultData.choice === "sell";
  const isKeepChoice = resultData.choice === "keep";

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Main Result Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden animate-in fade-in duration-500">
          {/* Header with gradient background */}
          <div
            className={`relative px-6 pt-8 pb-10 ${
              isSellChoice
                ? "bg-gradient-to-br from-green-50 via-emerald-50 to-green-100"
                : "bg-gradient-to-br from-blue-50 via-sky-50 to-blue-100"
            }`}
          >
            <div className="flex flex-col items-center text-center">
              {/* Animated icon */}
              <div
                className={`relative ${
                  isSellChoice ? "bg-green-500" : "bg-blue-500"
                } rounded-full p-4 mb-4 animate-in zoom-in duration-300 shadow-lg`}
              >
                {isSellChoice ? (
                  <CheckCircle2 className="h-10 w-10 text-white" />
                ) : (
                  <Package className="h-10 w-10 text-white" />
                )}
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {isSellChoice ? "Signal Deleted & Sold" : "Signal Deleted"}
              </h1>
              <p className="text-base text-gray-600 max-w-md">
                {isSellChoice
                  ? "Your remaining coins have been sold at market price"
                  : "Your coins are safely stored as orphaned assets"}
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-8 space-y-8">
            {/* Main stats card */}
            <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200 shadow-sm">
              <div className="flex items-baseline justify-center gap-3">
                <span className="text-5xl font-bold text-gray-900">
                  {resultData.quantity}
                </span>
                <span className="text-2xl font-semibold text-gray-600">
                  {resultData.symbol}
                </span>
              </div>
              <p className="text-center text-base text-gray-600 mt-3">
                {isSellChoice ? "Sold at market price" : "Saved to wallet"}
              </p>
            </div>

            {/* Details grid */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Transaction Details
              </h3>

              {/* OCO Orders Cancelled */}
              {resultData.ocoCount > 0 && (
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">
                    OCO Orders Cancelled
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {resultData.ocoCount}{" "}
                    {resultData.ocoCount === 1 ? "order" : "orders"}
                  </span>
                </div>
              )}

              {/* Sell Order ID (for sell choice) */}
              {isSellChoice && resultData.sellOrderId && (
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">
                    Sell Order ID
                  </span>
                  <span className="text-sm font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">
                    {resultData.sellOrderId}
                  </span>
                </div>
              )}

              {/* Orphaned Coin ID (for keep choice) */}
              {isKeepChoice && resultData.orphanedCoinId && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-gray-600">
                    Asset ID
                  </span>
                  <span className="text-sm font-mono text-gray-900 bg-gray-100 px-3 py-1 rounded truncate max-w-[250px]">
                    {resultData.orphanedCoinId.slice(0, 12)}...
                    {resultData.orphanedCoinId.slice(-8)}
                  </span>
                </div>
              )}
            </div>

            {/* Info box for orphaned coins */}
            {isKeepChoice && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 shadow-sm">
                <div className="flex gap-4">
                  <Package className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-blue-900 mb-2">
                      Coins saved to wallet
                    </h4>
                    <p className="text-sm text-blue-700 leading-relaxed">
                      Your {resultData.symbol} coins are safely stored in your
                      Binance wallet. You can view and manage them from the
                      Orphaned Coins page, where you can sell them at any time
                      or leave them for future trading.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Success confirmation for sell */}
            {isSellChoice && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 shadow-sm">
                <div className="flex gap-4">
                  <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-green-900 mb-2">
                      Trade closed successfully
                    </h4>
                    <p className="text-sm text-green-700 leading-relaxed">
                      All remaining {resultData.symbol} coins have been sold at
                      the current market price. The funds are now available in
                      your USDT balance and ready for your next trade.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer with action buttons */}
          <div className="px-6 pb-8 flex flex-col sm:flex-row gap-3">
            {isKeepChoice && (
              <Button
                variant="outline"
                onClick={handleViewOrphanedCoins}
                className="flex-1 sm:flex-initial"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Orphaned Coins
              </Button>
            )}
            <Button
              onClick={handleBackToSignals}
              className={`flex-1 ${
                isSellChoice
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              Back to Signal History
            </Button>
          </div>
        </div>

        {/* Additional help text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Transaction completed at{" "}
            {new Date().toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
