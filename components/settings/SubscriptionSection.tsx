"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle, Crown, Zap, Star, Copy, ExternalLink } from "lucide-react";
import { TIER_CONFIGS, PAYMENT_WALLET_ADDRESS } from "@/lib/subscription";

interface SubscriptionStatus {
  currentTier: {
    name: string;
    displayName: string;
    price: number;
    features: {
      signalsPerMonth: number;
      maxOpenPositions: number;
      prioritySupport: boolean;
      advancedAnalytics: boolean;
      telegramNotifications: boolean;
    };
  };
  usage: {
    signalsThisMonth: number;
    signalsLimit: number;
    activePositions: number;
    activePositionsLimit: number;
  };
  subscription: {
    isExpired: boolean;
    expiryDate?: Date;
    daysRemaining: number | null;
  };
}

interface Subscription {
  _id: string;
  tier: "free" | "premium" | "pro";
  amount: number;
  status: "pending" | "confirmed" | "expired" | "cancelled";
  txHash?: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

export function SubscriptionSection() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [history, setHistory] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<"premium" | "pro">("premium");
  const [txHash, setTxHash] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch("/api/subscriptions/status"),
        fetch("/api/subscriptions"),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.success) {
          setStatus(statusData.data);
        }
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (historyData.success) {
          setHistory(historyData.data);
        }
      }
    } catch (error) {
      console.error("Error fetching subscription data:", error);
      toast.error("Failed to load subscription data");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(PAYMENT_WALLET_ADDRESS);
    toast.success("Wallet address copied to clipboard");
  };

  const handleSubmitPayment = async () => {
    if (!txHash || txHash.length !== 64) {
      toast.error("Invalid transaction hash. Must be 64 characters.");
      return;
    }

    if (!fromAddress || !/^T[a-zA-Z0-9]{33}$/.test(fromAddress)) {
      toast.error("Invalid TRC20 address format");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: selectedTier,
          txHash,
          fromAddress,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Payment submitted successfully! Waiting for admin approval.");
        setTxHash("");
        setFromAddress("");
        await fetchSubscriptionData(); // Refresh data
      } else {
        toast.error(data.error?.message || "Failed to submit payment");
      }
    } catch (error) {
      console.error("Error submitting payment:", error);
      toast.error("Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "free":
        return <Star className="h-5 w-5 text-gray-500" />;
      case "premium":
        return <Zap className="h-5 w-5 text-blue-500" />;
      case "pro":
        return <Crown className="h-5 w-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (subscription: Subscription) => {
    switch (subscription.status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" /> Pending
          </Badge>
        );
      case "confirmed":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmed
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <XCircle className="h-3 w-3 mr-1" /> Expired
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" /> Cancelled
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Loading subscription information...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Tier Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status && getTierIcon(status.currentTier.name)}
            Current Plan: {status?.currentTier.displayName || "Free"}
          </CardTitle>
          <CardDescription>
            {status?.subscription.isExpired ? (
              <span className="text-red-600">Your subscription has expired</span>
            ) : status?.subscription.daysRemaining !== null && status?.subscription.daysRemaining !== undefined ? (
              <span>
                {status?.subscription.daysRemaining} days remaining until{" "}
                {status?.subscription.expiryDate &&
                  new Date(status.subscription.expiryDate).toLocaleDateString()}
              </span>
            ) : (
              <span>Free tier - No expiry</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Signals This Month</div>
                <div className="text-2xl font-bold">
                  {status.usage.signalsThisMonth || 0}
                  {status.usage.signalsLimit === -1 ? (
                    <span className="text-sm text-gray-500 ml-1">/ Unlimited</span>
                  ) : (
                    <span className="text-sm text-gray-500 ml-1">/ {status.usage.signalsLimit || 0}</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Active Positions</div>
                <div className="text-2xl font-bold">
                  {status.usage.activePositions || 0}
                  <span className="text-sm text-gray-500 ml-1">/ {status.usage.activePositionsLimit || 0}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      {status?.currentTier.name === "free" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade Your Plan</CardTitle>
            <CardDescription>Choose a plan that fits your trading needs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Premium Tier */}
              <div
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTier === "premium" ? "border-blue-500 bg-blue-50" : "border-gray-200"
                }`}
                onClick={() => setSelectedTier("premium")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-500" />
                    <h3 className="font-semibold">Premium</h3>
                  </div>
                  <div className="text-xl font-bold">${TIER_CONFIGS.premium.price}/mo</div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{TIER_CONFIGS.premium.description}</p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {TIER_CONFIGS.premium.features.signalsPerMonth} signals/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Up to {TIER_CONFIGS.premium.features.maxOpenPositions} open positions
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Telegram notifications
                  </li>
                </ul>
              </div>

              {/* Pro Tier */}
              <div
                className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTier === "pro" ? "border-yellow-500 bg-yellow-50" : "border-gray-200"
                }`}
                onClick={() => setSelectedTier("pro")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-yellow-500" />
                    <h3 className="font-semibold">Pro</h3>
                  </div>
                  <div className="text-xl font-bold">${TIER_CONFIGS.pro.price}/mo</div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{TIER_CONFIGS.pro.description}</p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Unlimited signals
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Up to {TIER_CONFIGS.pro.features.maxOpenPositions} open positions
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Priority support & Advanced analytics
                  </li>
                </ul>
              </div>
            </div>

            {/* Payment Instructions */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Payment Instructions</h4>
                <ol className="text-sm space-y-2 list-decimal list-inside text-gray-600">
                  <li>Send {TIER_CONFIGS[selectedTier].price} USDT (TRC20) to the address below</li>
                  <li>Copy the transaction hash and your sender address</li>
                  <li>Submit the payment details for verification</li>
                  <li>Wait for admin approval (usually within 24 hours)</li>
                </ol>
              </div>

              <div>
                <Label>Payment Wallet Address (TRC20)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={PAYMENT_WALLET_ADDRESS} readOnly className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={handleCopyAddress}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label>Transaction Hash</Label>
                <Input
                  placeholder="Enter TRC20 transaction hash (64 characters)"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Your TRC20 Address</Label>
                <Input
                  placeholder="Enter your TRC20 address (starts with T)"
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                  className="mt-1"
                />
              </div>

              <Button onClick={handleSubmitPayment} disabled={submitting} className="w-full">
                {submitting ? "Submitting..." : `Submit Payment (${TIER_CONFIGS[selectedTier].price} USDT)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Your subscription payment records</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((sub) => (
                <div key={sub._id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {getTierIcon(sub.tier)}
                      <span className="font-semibold capitalize">{sub.tier}</span>
                      {getStatusBadge(sub)}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {new Date(sub.createdAt).toLocaleDateString()} - ${sub.amount} USDT
                    </div>
                    {sub.txHash && (
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        TX: {sub.txHash.substring(0, 10)}...{sub.txHash.substring(54)}
                        <a
                          href={`https://tronscan.org/#/transaction/${sub.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center text-blue-500 hover:text-blue-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
