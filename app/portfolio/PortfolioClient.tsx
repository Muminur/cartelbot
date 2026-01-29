"use client";

/**
 * Portfolio Page - Container Component
 *
 * Responsibilities:
 * - Session management
 * - WebSocket connection with debouncing
 * - Refresh orchestration
 * - Layout structure
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_ROUTES } from "@/lib/constants";
import { UserProfile } from "@/types";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PortfolioWidget } from "@/components/dashboard/PortfolioWidget";
import { useWebSocketStream } from "@/hooks/useWebSocketStream";
import { useSession } from "@/contexts/SessionContext";
import { RefreshCw } from "lucide-react";

// Force dynamic rendering (skip static generation)
export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const router = useRouter();
  const { showSessionExpired } = useSession();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocketStream({
    autoConnect: true,
    onEvent: (event) => {
      // Set flag instead of immediate refresh (debouncing pattern)
      if (event.type === "executionReport" || event.type === "outboundAccountPosition") {
        setNeedsRefresh(true);
      }
    },
    onAuthenticationError: () => {
      // Show session expired modal when WebSocket authentication fails
      showSessionExpired();
    },
  });

  // Fetch user session
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

  // Debounced refresh: Wait 2 seconds after last WebSocket event
  // This prevents rapid refresh cascades from multiple events
  useEffect(() => {
    if (!needsRefresh) return;

    const timeout = setTimeout(() => {
      setRefreshKey(prev => prev + 1);
      setNeedsRefresh(false);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [needsRefresh]);

  // Manual refresh handler
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 dark:border-purple-400" />
      </div>
    );
  }

  // Unauthorized state
  if (!user) {
    return null;
  }

  return (
    <DashboardLayout userEmail={user.email}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Portfolio
            </h1>
            <p className="text-muted-foreground mt-2">
              View your complete Binance portfolio with real-time prices
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live
              </div>
            )}
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              aria-label="Refresh portfolio"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Portfolio Widget */}
        {/* Key prop removed - usePortfolioData hook handles refreshing internally */}
        <PortfolioWidget onRefresh={handleRefresh} />
      </div>
    </DashboardLayout>
  );
}
