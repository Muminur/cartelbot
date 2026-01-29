"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TosWarning } from "@/components/discord/TosWarning";
import { TokenInput } from "@/components/discord/TokenInput";
import { ServerSelector } from "@/components/discord/ServerSelector";
import { ChannelSelector } from "@/components/discord/ChannelSelector";
import { ConnectionCard } from "@/components/discord/ConnectionCard";
import { MessageLog } from "@/components/discord/MessageLog";
import { SignalNotificationPanel } from "@/components/discord/SignalNotificationPanel";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Plus, MessageSquare, Radio } from "lucide-react";
import { toast } from "sonner";
import { IDiscordConnection, IDiscordMessage } from "@/types/discord";
import { useDiscordNotifications } from "@/hooks/useDiscordNotifications";

const connectionSchema = z.object({
  token: z.string().min(50, "Invalid Discord token"),
  serverId: z.string().min(1, "Select a server"),
  serverName: z.string(),
  channelId: z.string().min(1, "Select a channel"),
  channelName: z.string(),
  autoExecute: z.boolean().default(true),
  requireConfirmation: z.boolean().default(false),
  tosAccepted: z.boolean().refine((val) => val === true, "Must accept Terms of Service"),
});

type ConnectionFormData = z.infer<typeof connectionSchema>;

export default function DiscordIntegrationClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [connections, setConnections] = useState<IDiscordConnection[]>([]);
  const [recentMessages, setRecentMessages] = useState<IDiscordMessage[]>([]);
  const [showTosWarning, setShowTosWarning] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);

  // Real-time Discord notifications via SSE
  const { isConnected: isNotificationsConnected, eventCount, recentEvents, clearEvents } = useDiscordNotifications();

  // Form state
  const [token, setToken] = useState("");
  const [serverId, setServerId] = useState("");
  const [serverName, setServerName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [autoExecute, setAutoExecute] = useState(true);
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  // Discord user info (set after token validation)
  const [discordUserId, setDiscordUserId] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");

  const {
    
    setError,
    clearErrors,
  } = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionSchema),
    mode: "onChange",
  });

  // Fetch connections and messages on mount
  const fetchData = useCallback(async () => {
    try {
      const [connectionsRes, messagesRes] = await Promise.all([
        fetch("/api/discord/connections"),
        fetch("/api/discord/messages?limit=20"),
      ]);

      if (!connectionsRes.ok) {
        if (connectionsRes.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch connections");
      }

      const connectionsData = await connectionsRes.json();
      const messagesData = await messagesRes.json();

      setConnections(connectionsData.connections || []);
      setRecentMessages(messagesData.messages || []);
    } catch (error) {
      toast.error("Failed to load Discord integration data");
      if (process.env.NODE_ENV === "development") {
        console.error("Data fetch error:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const resetForm = () => {
    setToken("");
    setServerId("");
    setServerName("");
    setChannelId("");
    setChannelName("");
    setAutoExecute(true);
    setRequireConfirmation(false);
    setTosAccepted(false);
    setIsTokenValid(false);
    setDiscordUserId("");
    setDiscordUsername("");
    clearErrors();
  };

  const validateForm = (): boolean => {
    let isValid = true;

    if (!token || token.length < 50) {
      setError("token", { message: "Invalid Discord token" });
      isValid = false;
    }

    if (!serverId) {
      setError("serverId", { message: "Select a server" });
      isValid = false;
    }

    if (!channelId) {
      setError("channelId", { message: "Select a channel" });
      isValid = false;
    }

    if (!tosAccepted) {
      setError("tosAccepted", { message: "Must accept Terms of Service" });
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async () => {
    // Debug logging - check state before validation
    if (process.env.NODE_ENV === "development") {
      console.log("[Discord Connection] Submit clicked - Current state:", {
        hasToken: !!token,
        hasServerId: !!serverId,
        hasChannelId: !!channelId,
        tosAccepted,
        isTokenValid,
        hasDiscordUserId: !!discordUserId,
        hasDiscordUsername: !!discordUsername,
        discordUserId,
        discordUsername,
      });
    }

    if (!validateForm()) {
      toast.error("Please complete all required fields");
      return;
    }

    if (!tosAccepted) {
      setShowTosWarning(true);
      return;
    }

    // Critical validation: Ensure Discord user info is present
    if (!discordUserId || !discordUsername) {
      toast.error("Please test your Discord token first to validate your account");
      if (process.env.NODE_ENV === "development") {
        console.error("[Discord Connection] Missing Discord user info:", {
          discordUserId,
          discordUsername,
        });
      }
      return;
    }

    setIsSubmitting(true);

    try {
      const requestBody = {
        token,
        serverId,
        serverName,
        channelId,
        channelName,
        autoExecute,
        requireConfirmation,
        tosAccepted,
        // Pass Discord user info from token validation (avoids redundant API call)
        discordUserId,
        discordUsername,
      };

      if (process.env.NODE_ENV === "development") {
        console.log("[Discord Connection] Sending request:", {
          ...requestBody,
          token: requestBody.token ? `${requestBody.token.slice(0, 10)}...` : "missing",
          discordUserId: requestBody.discordUserId || "MISSING",
          discordUsername: requestBody.discordUsername || "MISSING",
        });
      }

      const response = await fetch("/api/discord/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Discord connection created successfully");
        resetForm();
        setIsFormOpen(false);
        fetchData();
      } else {
        const errorMessage = data.error?.message || data.error || "Failed to create connection";
        toast.error(errorMessage);
        if (process.env.NODE_ENV === "development") {
          console.error("Connection API error:", data);
        }
      }
    } catch (error) {
      toast.error("Failed to create connection. Please try again.");
      if (process.env.NODE_ENV === "development") {
        console.error("Connection creation error:", error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTosAccept = () => {
    setTosAccepted(true);
    setShowTosWarning(false);
    handleSubmit();
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <MessageSquare className="h-8 w-8" />
              Discord Signal Integration
            </h1>
            <p className="text-muted-foreground mt-2">
              Connect Discord channels to automatically monitor and execute trading signals
            </p>
          </div>
          {/* Live Notifications Status */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
            <Radio className={`h-4 w-4 ${isNotificationsConnected ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
            <div className="text-sm">
              <div className="font-medium">
                {isNotificationsConnected ? "Live Notifications" : "Connecting..."}
              </div>
              {eventCount > 0 && (
                <div className="text-xs text-muted-foreground">
                  {eventCount} event{eventCount !== 1 ? "s" : ""} received
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        {connections.length === 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important Warning</AlertTitle>
            <AlertDescription>
              Discord account automation violates Discord&apos;s Terms of Service and may result in
              account termination. Use a separate Discord account and proceed at your own risk.
            </AlertDescription>
          </Alert>
        )}

        {/* Add New Connection */}
        <Card>
          <Collapsible open={isFormOpen} onOpenChange={setIsFormOpen}>
            <CardHeader>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Add New Connection
                  </CardTitle>
                  {isFormOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CardDescription>
                Connect a Discord channel to monitor trading signals
              </CardDescription>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* Token Input */}
                <TokenInput
                  value={token}
                  onChange={setToken}
                  onValidate={(isValid, userInfo) => {
                    setIsTokenValid(isValid);
                    if (isValid && userInfo) {
                      setDiscordUserId(userInfo.userId);
                      setDiscordUsername(userInfo.username);
                    } else {
                      setDiscordUserId("");
                      setDiscordUsername("");
                    }
                  }}
                />

                {/* Server Selector */}
                <ServerSelector
                  token={token}
                  onSelect={(id, name) => {
                    setServerId(id);
                    setServerName(name);
                  }}
                  disabled={!isTokenValid}
                />

                {/* Channel Selector */}
                <ChannelSelector
                  serverId={serverId}
                  token={token}
                  onSelect={(id, name) => {
                    setChannelId(id);
                    setChannelName(name);
                  }}
                  disabled={!serverId}
                />

                {/* Settings */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Connection Settings</h3>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="new-auto-execute">Auto-execute trades</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically execute parsed signals
                      </p>
                    </div>
                    <Switch
                      id="new-auto-execute"
                      checked={autoExecute}
                      onCheckedChange={setAutoExecute}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="new-require-confirmation">Require confirmation</Label>
                      <p className="text-sm text-muted-foreground">
                        Ask for confirmation before executing trades
                      </p>
                    </div>
                    <Switch
                      id="new-require-confirmation"
                      checked={requireConfirmation}
                      onCheckedChange={setRequireConfirmation}
                    />
                  </div>
                </div>

                {/* TOS Acceptance */}
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Terms of Service</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      By connecting a Discord account, you acknowledge that this violates
                      Discord&apos;s Terms of Service and may result in account termination.
                    </p>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="tos-checkbox"
                        checked={tosAccepted}
                        onChange={(e) => setTosAccepted(e.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <label htmlFor="tos-checkbox" className="text-sm font-medium">
                        I understand and accept the risks
                      </label>
                    </div>
                  </AlertDescription>
                </Alert>

                {/* Submit Button */}
                <div className="space-y-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      !token ||
                      !serverId ||
                      !channelId ||
                      !tosAccepted ||
                      !isTokenValid ||
                      !discordUserId ||
                      !discordUsername ||
                      isSubmitting
                    }
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect Discord Channel"
                    )}
                  </Button>
                  {!isTokenValid && token && (
                    <Alert variant="default" className="py-2">
                      <AlertDescription className="text-sm">
                        Please click &quot;Test Connection&quot; to validate your Discord token before connecting
                      </AlertDescription>
                    </Alert>
                  )}
                  {isTokenValid && discordUsername && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Connected as: {discordUsername}
                    </p>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Active Connections */}
        {connections.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Active Connections</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connections.map((connection) => (
                <ConnectionCard
                  key={String(connection._id)}
                  connection={connection}
                  onUpdate={fetchData}
                />
              ))}
            </div>
          </div>
        )}

        {/* Live Signal Notifications Panel */}
        <SignalNotificationPanel events={recentEvents} onClear={clearEvents} />

        {/* Recent Messages */}
        <MessageLog messages={recentMessages} onRefresh={fetchData} />

        {/* TOS Warning Dialog */}
        <TosWarning
          open={showTosWarning}
          onOpenChange={setShowTosWarning}
          onAccept={handleTosAccept}
        />
      </div>
    </DashboardLayout>
  );
}
