"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
import { API_ROUTES } from "@/lib/constants";
import { UserProfile } from "@/types";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SubscriptionSection } from "@/components/settings/SubscriptionSection";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface TestConnectionResult {
  connected: boolean;
  canTrade?: boolean;
  canWithdraw?: boolean;
  canDeposit?: boolean;
  usdtBalance?: number;
  topBalances?: Array<{ asset: string; free: string; locked: string }>;
  accountType?: string;
  error?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // API Keys state
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [hasApiKeys, setHasApiKeys] = useState(false);
  const [apiKeyPreview, setApiKeyPreview] = useState<string | null>(null);
  const [savingApiKeys, setSavingApiKeys] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<TestConnectionResult | null>(null);
  const [useTestnet, setUseTestnet] = useState(false);

  // Trade Settings state
  const [investmentAmount, setInvestmentAmount] = useState(100);
  const [targetDistribution, setTargetDistribution] = useState([75, 15, 10]);
  const [positionSizingMethod, setPositionSizingMethod] = useState<"fixed" | "percentage" | "risk_based">("fixed");
  const [riskPercentage, setRiskPercentage] = useState(2);
  const [maxPositionSize, setMaxPositionSize] = useState(10000);
  const [maxDailyLoss, setMaxDailyLoss] = useState(1000);
  const [maxOpenPositions, setMaxOpenPositions] = useState(10);
  const [requireApproval, setRequireApproval] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [savingTradeSettings, setSavingTradeSettings] = useState(false);

  // Notification Settings state
  const [onTradeExecuted, setOnTradeExecuted] = useState(true);
  const [onTargetHit, setOnTargetHit] = useState(true);
  const [onStopLossHit, setOnStopLossHit] = useState(true);
  const [dailySummary, setDailySummary] = useState(false);
  const [emailFrequency, setEmailFrequency] = useState<"instant" | "hourly" | "daily">("instant");
  const [savingNotifications, setSavingNotifications] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sessionResponse, apiKeysResponse, settingsResponse] = await Promise.all([
          fetch(API_ROUTES.AUTH.SESSION),
          fetch("/api/user/api-keys"),
          fetch("/api/user/settings"),
        ]);

        const sessionData = await sessionResponse.json();

        if (!sessionResponse.ok || !sessionData.success) {
          router.push("/login");
          return;
        }

        setUser(sessionData.data.user);

        // Load API keys status
        if (apiKeysResponse.ok) {
          const apiKeysData = await apiKeysResponse.json();
          if (apiKeysData.success) {
            setHasApiKeys(apiKeysData.data.hasApiKeys);
            setApiKeyPreview(apiKeysData.data.apiKeyPreview);
          }
        }

        // Load trade settings
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.success) {
            const data = settingsData.data;
            setMaxPositionSize(data.maxPositionSize || 10000);
            setMaxDailyLoss(data.maxDailyLoss || 1000);
            setMaxOpenPositions(data.maxOpenPositions || 10);
            setRequireApproval(data.requireApproval || false);
            setEmergencyStop(data.emergencyStop || false);
            setUseTestnet(data.useTestnet || false);
          }
        }

        // Load user-specific settings from session
        if (sessionData.data.user) {
          const userData = sessionData.data.user;
          setInvestmentAmount(userData.investmentAmount || 100);
          setTargetDistribution(userData.targetDistribution || [75, 15, 10]);
          setPositionSizingMethod(userData.positionSizingMethod || "fixed");
          setRiskPercentage(userData.riskPercentage || 2);

          // Load notification preferences
          if (userData.emailNotifications) {
            setOnTradeExecuted(userData.emailNotifications.onTradeExecuted ?? true);
            setOnTargetHit(userData.emailNotifications.onTargetHit ?? true);
            setOnStopLossHit(userData.emailNotifications.onStopLossHit ?? true);
            setDailySummary(userData.emailNotifications.dailySummary ?? false);
          }
          setEmailFrequency(userData.emailFrequency || "instant");
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleSaveApiKeys = async () => {
    if (!apiKey || !apiSecret) {
      toast.error("Please enter both API key and secret");
      return;
    }

    if (apiKey.length < 64 || apiSecret.length < 64) {
      toast.error("Invalid API key or secret format");
      return;
    }

    setSavingApiKeys(true);
    setConnectionResult(null);

    try {
      // Save API keys and testnet preference atomically in single request
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret, useTestnet }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("API keys saved successfully");
        setHasApiKeys(true);
        setApiKey("");
        setApiSecret("");
        setApiKeyPreview(`${apiKey.substring(0, 8)}...`);
      } else {
        toast.error(data.error?.message || "Failed to save API keys");
      }
    } catch (error) {
      console.error("Error saving API keys:", error);
      toast.error("Failed to save API keys");
    } finally {
      setSavingApiKeys(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);

    try {
      const response = await fetch("/api/user/test-connection", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Connection successful!");
        setConnectionResult({
          connected: true,
          ...data.data,
        });
      } else {
        const errorMessage = data.error?.message || "Connection test failed";
        toast.error(errorMessage);
        // Set error state to display in UI
        setConnectionResult({
          connected: false,
          error: errorMessage,
        });
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to test connection";
      toast.error(errorMessage);
      // Set error state to display in UI
      setConnectionResult({
        connected: false,
        error: errorMessage,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveTradeSettings = async () => {
    setSavingTradeSettings(true);

    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxPositionSize,
          maxDailyLoss,
          maxOpenPositions,
          requireApproval,
          emergencyStop,
          useTestnet,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Trade settings saved successfully");
      } else {
        toast.error(data.error?.message || "Failed to save trade settings");
      }
    } catch (error) {
      console.error("Error saving trade settings:", error);
      toast.error("Failed to save trade settings");
    } finally {
      setSavingTradeSettings(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(API_ROUTES.AUTH.LOGOUT, { method: "POST" });
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-2">Manage your account and trading preferences</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your account details and subscription status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={user.email} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription">Subscription Tier</Label>
                <Input id="subscription" value={user.subscriptionTier.toUpperCase()} disabled />
              </div>
              {user.subscriptionExpiry && (
                <div className="space-y-2">
                  <Label htmlFor="expiry">Subscription Expiry</Label>
                  <Input
                    id="expiry"
                    value={new Date(user.subscriptionExpiry).toLocaleDateString()}
                    disabled
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Binance API Keys */}
          <Card>
            <CardHeader>
              <CardTitle>Binance API Keys</CardTitle>
              <CardDescription>
                Configure your Binance API keys to enable automated trading
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-900">
                  <strong>Security Notice:</strong> Your API keys are encrypted with AES-256-GCM
                  before storage. Never share your API keys with anyone.
                </p>
              </div>

              {hasApiKeys && apiKeyPreview && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-900">API Keys Configured</p>
                    <p className="text-xs text-green-700">Current key: {apiKeyPreview}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={hasApiKeys ? "Enter new API key to update" : "Enter your Binance API key"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  placeholder={hasApiKeys ? "Enter new API secret to update" : "Enter your Binance API secret"}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={handleSaveApiKeys}
                  disabled={savingApiKeys || (!apiKey && !apiSecret)}
                  className="flex-1"
                >
                  {savingApiKeys ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save API Keys"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={!hasApiKeys || testingConnection}
                >
                  {testingConnection ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    "Test Connection"
                  )}
                </Button>
              </div>

              {connectionResult && connectionResult.connected && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    <p className="text-sm font-medium text-blue-900">Connection Successful</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-700">Environment:</span>{" "}
                      <span className={`font-medium px-2 py-1 rounded text-xs ${
                        useTestnet
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                      }`}>
                        {useTestnet ? "TESTNET" : "MAINNET"}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-700">Can Trade:</span>{" "}
                      <span className="font-medium">{connectionResult.canTrade ? "Yes" : "No"}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">Account Type:</span>{" "}
                      <span className="font-medium">{connectionResult.accountType}</span>
                    </div>
                    <div>
                      <span className="text-blue-700">USDT Balance:</span>{" "}
                      <span className="font-medium">{connectionResult.usdtBalance?.toFixed(2) || "0.00"} USDT</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-blue-700">Assets:</span>{" "}
                      <span className="font-medium">{connectionResult.topBalances?.length || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              {connectionResult && !connectionResult.connected && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md space-y-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <p className="text-sm font-medium text-red-900">Connection Failed</p>
                  </div>
                  <div className="text-sm text-red-700">
                    <p className="font-medium mb-2">{connectionResult.error}</p>
                    <div className="space-y-1 text-xs">
                      <p className="font-medium text-red-800">Common causes:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>API key or secret is incorrect</li>
                        <li>API key does not match the selected environment (testnet/mainnet)</li>
                        <li>Server IP not whitelisted on Binance</li>
                        <li>Spot & Margin Trading permission not enabled</li>
                      </ul>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    className="w-full"
                  >
                    Retry Connection
                  </Button>
                </div>
              )}

              {/* Testnet/Mainnet Toggle */}
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex-1">
                  <Label htmlFor="useTestnet" className="text-base font-medium text-blue-900">
                    Use Binance Testnet
                  </Label>
                  <p className="text-sm text-blue-700 mt-1">
                    Enable this to use Binance Testnet for testing without real funds.
                    You will need testnet API keys from{" "}
                    <a
                      href="https://testnet.binance.vision"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-900"
                    >
                      testnet.binance.vision
                    </a>
                  </p>
                </div>
                <Switch
                  id="useTestnet"
                  checked={useTestnet}
                  onCheckedChange={setUseTestnet}
                />
              </div>
            </CardContent>
          </Card>

          {/* Trading Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Trading Settings</CardTitle>
              <CardDescription>Configure default trading parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="investmentAmount">Default Investment Amount (USDT)</Label>
                <Input
                  id="investmentAmount"
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(parseFloat(e.target.value))}
                  min="10"
                  max="100000"
                />
                <p className="text-xs text-gray-500">
                  Amount to invest per signal when using fixed position sizing
                </p>
              </div>

              <div className="space-y-2">
                <Label>Target Distribution (%)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Input
                      type="number"
                      value={targetDistribution[0]}
                      onChange={(e) =>
                        setTargetDistribution([
                          parseFloat(e.target.value),
                          targetDistribution[1],
                          targetDistribution[2],
                        ])
                      }
                      min="0"
                      max="100"
                    />
                    <p className="text-xs text-gray-500 mt-1">Target 1</p>
                  </div>
                  <div>
                    <Input
                      type="number"
                      value={targetDistribution[1]}
                      onChange={(e) =>
                        setTargetDistribution([
                          targetDistribution[0],
                          parseFloat(e.target.value),
                          targetDistribution[2],
                        ])
                      }
                      min="0"
                      max="100"
                    />
                    <p className="text-xs text-gray-500 mt-1">Target 2</p>
                  </div>
                  <div>
                    <Input
                      type="number"
                      value={targetDistribution[2]}
                      onChange={(e) =>
                        setTargetDistribution([
                          targetDistribution[0],
                          targetDistribution[1],
                          parseFloat(e.target.value),
                        ])
                      }
                      min="0"
                      max="100"
                    />
                    <p className="text-xs text-gray-500 mt-1">Target 3</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Distribution of position across targets (must sum to 100%)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxPositionSize">Max Position Size (USDT)</Label>
                  <Input
                    id="maxPositionSize"
                    type="number"
                    value={maxPositionSize}
                    onChange={(e) => setMaxPositionSize(parseFloat(e.target.value))}
                    min="10"
                    max="100000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDailyLoss">Max Daily Loss (USDT)</Label>
                  <Input
                    id="maxDailyLoss"
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(parseFloat(e.target.value))}
                    min="0"
                    max="50000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxOpenPositions">Max Open Positions</Label>
                <Input
                  id="maxOpenPositions"
                  type="number"
                  value={maxOpenPositions}
                  onChange={(e) => setMaxOpenPositions(parseInt(e.target.value))}
                  min="1"
                  max="50"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Manual Approval</Label>
                    <p className="text-xs text-gray-500">
                      Review trades before execution
                    </p>
                  </div>
                  <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Emergency Stop</Label>
                    <p className="text-xs text-gray-500">
                      Disable all automated trading
                    </p>
                  </div>
                  <Switch checked={emergencyStop} onCheckedChange={setEmergencyStop} />
                </div>
              </div>

              {emergencyStop && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <p className="text-sm text-red-900">
                    Emergency stop is active. All automated trading is disabled.
                  </p>
                </div>
              )}

              <Button onClick={handleSaveTradeSettings} disabled={savingTradeSettings} className="w-full">
                {savingTradeSettings ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Trade Settings"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Subscription Management */}
          <SubscriptionSection />

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Configure email notifications for trading events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Trade Executed</Label>
                    <p className="text-xs text-gray-500">
                      Notify when a new trade is executed
                    </p>
                  </div>
                  <Switch checked={onTradeExecuted} onCheckedChange={setOnTradeExecuted} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Target Hit</Label>
                    <p className="text-xs text-gray-500">
                      Notify when a take-profit target is reached
                    </p>
                  </div>
                  <Switch checked={onTargetHit} onCheckedChange={setOnTargetHit} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Stop Loss Hit</Label>
                    <p className="text-xs text-gray-500">
                      Notify when a stop loss is triggered
                    </p>
                  </div>
                  <Switch checked={onStopLossHit} onCheckedChange={setOnStopLossHit} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Daily Summary</Label>
                    <p className="text-xs text-gray-500">
                      Receive a daily summary of all trades
                    </p>
                  </div>
                  <Switch checked={dailySummary} onCheckedChange={setDailySummary} />
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  <strong>Coming Soon:</strong> Email notification preferences will be fully functional in the next update.
                  Currently configured preferences are saved but emails are not yet being sent.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Delete Account</h3>
                  <p className="text-sm text-gray-600">
                    Permanently delete your account and all associated data
                  </p>
                </div>
                <Button variant="destructive" disabled>
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
