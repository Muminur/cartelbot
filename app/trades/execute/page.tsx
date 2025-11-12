"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { API_ROUTES } from "@/lib/constants";
import { UserProfile } from "@/types";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface Signal {
  _id: string;
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  currentPrice?: number;
  createdAt: string;
}

function ExecuteTradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signalId = searchParams.get("signalId");

  const [user, setUser] = useState<UserProfile | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  // Position sizing state
  const [sizingMethod, setSizingMethod] = useState("fixed");
  const [tradeAmount, setTradeAmount] = useState("100");
  const [percentage, setPercentage] = useState("5");
  const [riskPercent, setRiskPercent] = useState("2");

  useEffect(() => {
    const fetchData = async () => {
      if (!signalId) {
        toast.error("No signal ID provided");
        router.push("/signals/history");
        return;
      }

      try {
        const [sessionRes, signalRes] = await Promise.all([
          fetch(API_ROUTES.AUTH.SESSION),
          fetch(`/api/signals/${signalId}`),
        ]);

        const sessionData = await sessionRes.json();
        const signalData = await signalRes.json();

        if (!sessionRes.ok || !sessionData.success) {
          router.push("/login");
          return;
        }

        if (!signalRes.ok || !signalData.success) {
          toast.error("Failed to load signal");
          router.push("/signals/history");
          return;
        }

        setUser(sessionData.data.user);
        setSignal(signalData.data);
      } catch (error) {
        toast.error("Failed to load data");
        router.push("/signals/history");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [signalId, router]);

  const handleExecute = async () => {
    if (!signal) return;

    setExecuting(true);

    try {
      const requestBody: any = {
        signalId: signal._id,
        positionSizing: {
          method: sizingMethod,
        },
      };

      if (sizingMethod === "fixed") {
        requestBody.positionSizing.amount = parseFloat(tradeAmount);
      } else if (sizingMethod === "percentage") {
        requestBody.positionSizing.percentage = parseFloat(percentage);
      } else if (sizingMethod === "risk_based") {
        requestBody.positionSizing.riskPercent = parseFloat(riskPercent);
      }

      const response = await fetch("/api/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to execute trade");
      }

      toast.success("Trade executed successfully!");
      router.push("/trades");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to execute trade");
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!user || !signal) {
    return null;
  }

  const entryPriceMin = signal.entries[0];
  const entryPriceMax = signal.entries[signal.entries.length - 1];
  const riskRewardRatio = signal.stopLoss
    ? ((signal.targets[0] - entryPriceMin) / (entryPriceMin - signal.stopLoss)).toFixed(2)
    : "N/A";

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Execute Trade</h1>
            <p className="text-gray-600 mt-1">Review signal and confirm execution</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Signal Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Signal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Symbol</p>
                <p className="text-2xl font-bold">{signal.symbol}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Entry Range</p>
                  <p className="font-medium">
                    ${entryPriceMin.toFixed(4)} - ${entryPriceMax.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Stop Loss</p>
                  <p className="font-medium text-red-600 flex items-center gap-1">
                    <TrendingDown className="w-4 h-4" />
                    ${signal.stopLoss.toFixed(4)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Targets</p>
                <div className="space-y-1">
                  {signal.targets.map((target, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Target {index + 1}</span>
                      <span className="font-medium text-green-600 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        ${target.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Risk/Reward Ratio</span>
                  <span className="font-bold text-purple-600">1:{riskRewardRatio}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Position Sizing Card */}
          <Card>
            <CardHeader>
              <CardTitle>Position Sizing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={sizingMethod} onValueChange={setSizingMethod}>
                <div className="space-y-4">
                  {/* Fixed Amount */}
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="fixed" id="fixed" className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="fixed" className="font-medium">Fixed Amount</Label>
                      <Input
                        type="number"
                        value={tradeAmount}
                        onChange={(e) => setTradeAmount(e.target.value)}
                        disabled={sizingMethod !== "fixed"}
                        placeholder="Enter USDT amount"
                        min="10"
                        step="10"
                      />
                      <p className="text-xs text-gray-500">Trade with a fixed USDT amount</p>
                    </div>
                  </div>

                  {/* Percentage of Balance */}
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="percentage" id="percentage" className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="percentage" className="font-medium">Percentage of Balance</Label>
                      <Input
                        type="number"
                        value={percentage}
                        onChange={(e) => setPercentage(e.target.value)}
                        disabled={sizingMethod !== "percentage"}
                        placeholder="Enter percentage"
                        min="1"
                        max="100"
                        step="1"
                      />
                      <p className="text-xs text-gray-500">Use % of your USDT balance</p>
                    </div>
                  </div>

                  {/* Risk-Based (2% Rule) */}
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="risk_based" id="risk_based" className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="risk_based" className="font-medium">Risk-Based (% Rule)</Label>
                      <Input
                        type="number"
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(e.target.value)}
                        disabled={sizingMethod !== "risk_based"}
                        placeholder="Risk percentage"
                        min="0.5"
                        max="10"
                        step="0.5"
                      />
                      <p className="text-xs text-gray-500">Risk % of total balance per trade</p>
                    </div>
                  </div>
                </div>
              </RadioGroup>

              <div className="pt-4 border-t">
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  size="lg"
                >
                  {executing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Confirm & Execute Trade
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ExecuteTradePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    }>
      <ExecuteTradeContent />
    </Suspense>
  );
}
