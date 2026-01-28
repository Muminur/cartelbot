"use client";

import { useEffect, useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Crown, AlertCircle, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

interface SubscriptionData {
  currentTier: {
    name: string;
    displayName: string;
    signalsPerMonth: number;
    maxPositions: number;
    price: number;
  };
  usage: {
    signalsThisMonth: number;
    signalsLimit: number;
    activePositions: number;
    activePositionsLimit: number;
  };
  subscription: {
    isExpired: boolean;
    expiryDate?: string;
    daysRemaining: number | null;
  };
}

function SubscriptionStatusWidget() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/subscriptions/status");
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Failed to load subscription data");
      }
    } catch (err) {
      console.error("Error fetching subscription status:", err);
      setError("Failed to load subscription data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground dark:text-gray-400">
            <Crown className="h-4 w-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground dark:text-gray-400">
            <Crown className="h-4 w-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>{error || "Error loading"}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { currentTier, usage, subscription } = data;
  const signalsPercentage = (usage.signalsThisMonth / usage.signalsLimit) * 100;
  const positionsPercentage = (usage.activePositions / usage.activePositionsLimit) * 100;

  const isNearSignalLimit = signalsPercentage >= 80;
  const isNearPositionLimit = positionsPercentage >= 80;
  const isFree = currentTier.name === "free";

  // Tier color mapping
  const tierColors = {
    free: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    premium: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    pro: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };

  const tierColor = tierColors[currentTier.name as keyof typeof tierColors] || tierColors.free;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground dark:text-gray-400">
            <Crown className={`h-4 w-4 ${currentTier.name === "pro" ? "text-purple-600" : currentTier.name === "premium" ? "text-blue-600" : "text-gray-600"}`} />
            Subscription
          </CardTitle>
          <Badge className={tierColor}>
            {currentTier.displayName}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Days Remaining (if applicable) */}
        {subscription.daysRemaining !== null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground dark:text-gray-400">Expires in</span>
            <span className={`font-semibold ${subscription.daysRemaining <= 7 ? "text-red-600 dark:text-red-400" : "text-foreground dark:text-white"}`}>
              {subscription.daysRemaining} days
            </span>
          </div>
        )}

        {/* Signals Usage */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground dark:text-gray-400">Signals</span>
            <span className={`font-medium ${isNearSignalLimit ? "text-orange-600 dark:text-orange-400" : "text-foreground dark:text-white"}`}>
              {usage.signalsThisMonth} / {usage.signalsLimit === 999999 ? "∞" : usage.signalsLimit}
            </span>
          </div>
          <Progress
            value={Math.min(signalsPercentage, 100)}
            className={`h-1.5 ${isNearSignalLimit ? "bg-orange-200 dark:bg-orange-900" : ""}`}
          />
        </div>

        {/* Positions Usage */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground dark:text-gray-400">Active Positions</span>
            <span className={`font-medium ${isNearPositionLimit ? "text-orange-600 dark:text-orange-400" : "text-foreground dark:text-white"}`}>
              {usage.activePositions} / {usage.activePositionsLimit}
            </span>
          </div>
          <Progress
            value={Math.min(positionsPercentage, 100)}
            className={`h-1.5 ${isNearPositionLimit ? "bg-orange-200 dark:bg-orange-900" : ""}`}
          />
        </div>

        {/* Upgrade Button for Free Tier or Near Limits */}
        {(isFree || isNearSignalLimit || isNearPositionLimit) && (
          <Button
            size="sm"
            variant={isFree ? "default" : "outline"}
            className="w-full mt-2"
            onClick={() => router.push("/settings")}
          >
            <TrendingUp className="h-3 w-3 mr-1.5" />
            {isFree ? "Upgrade Plan" : "Manage Subscription"}
          </Button>
        )}
      </CardContent>

      {/* Decorative gradient for Pro tier */}
      {currentTier.name === "pro" && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
      )}
    </Card>
  );
}

export default memo(SubscriptionStatusWidget);
