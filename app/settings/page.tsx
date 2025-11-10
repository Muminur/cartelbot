"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_ROUTES } from "@/lib/constants";
import { UserProfile } from "@/types";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(API_ROUTES.AUTH.SESSION);
        const data = await response.json();

        if (!response.ok || !data.success) {
          router.push("/login");
          return;
        }

        setUser(data.data.user);
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [router]);

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-white">CB</span>
              </div>
              <span className="text-xl font-bold">CartelBot</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
                Dashboard
              </Button>
              <span className="text-sm text-gray-600">{user.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Manage your account and API keys</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your account details and subscription status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <Input type="email" value={user.email} disabled />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subscription Tier</label>
                <Input value={user.subscriptionTier.toUpperCase()} disabled />
              </div>
              {user.subscriptionExpiry && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subscription Expiry</label>
                  <Input
                    value={new Date(user.subscriptionExpiry).toLocaleDateString()}
                    disabled
                  />
                </div>
              )}
            </CardContent>
          </Card>

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

              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  placeholder={user.hasApiKeys ? "••••••••••••••••" : "Enter your Binance API key"}
                  disabled
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">API Secret</label>
                <Input
                  type="password"
                  placeholder={user.hasApiKeys ? "••••••••••••••••" : "Enter your Binance API secret"}
                  disabled
                />
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  <strong>Coming Soon:</strong> API key management will be available in the next update.
                  This feature is part of Milestone 3 and will allow you to securely store and test your Binance API keys.
                </p>
              </div>

              <div className="flex space-x-3">
                <Button disabled className="flex-1">
                  Save API Keys
                </Button>
                <Button variant="outline" disabled>
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trading Settings</CardTitle>
              <CardDescription>Configure default trading parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Default Investment Amount (USDT)</label>
                <Input type="number" placeholder="100" disabled />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Target Distribution (%)</label>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="75" disabled />
                  <Input type="number" placeholder="15" disabled />
                  <Input type="number" placeholder="10" disabled />
                </div>
                <p className="text-xs text-gray-500">
                  Distribution for first, second, and third targets
                </p>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  <strong>Coming Soon:</strong> Trading settings will be available in the next update.
                </p>
              </div>

              <Button disabled className="w-full">
                Save Settings
              </Button>
            </CardContent>
          </Card>

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
      </main>
    </div>
  );
}
