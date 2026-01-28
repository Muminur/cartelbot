"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrackedEvent } from "@/hooks/useDiscordNotifications";
import {
  Bell,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  FileText,
  Play,
  XCircle,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface SignalNotificationPanelProps {
  events: TrackedEvent[];
  onClear: () => void;
}

/**
 * Get icon for event type
 * Pure helper function moved outside component to prevent recreation on every render
 */
function getEventIcon(type: string) {
  switch (type) {
    case "message_received":
      return <MessageSquare className="h-4 w-4" />;
    case "parsing":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "parsed":
      return <FileText className="h-4 w-4" />;
    case "executing":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <XCircle className="h-4 w-4" />;
    case "target_hit":
      return <TrendingUp className="h-4 w-4" />;
    case "stop_loss":
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

/**
 * Get badge variant and text for event type
 * Pure helper function moved outside component to prevent recreation on every render
 */
function getEventBadge(type: string, status?: string) {
  switch (type) {
    case "message_received":
      return { variant: "secondary" as const, text: "New Message" };
    case "parsing":
      return { variant: "default" as const, text: "Parsing" };
    case "parsed":
      return { variant: "outline" as const, text: "Parsed" };
    case "executing":
      return { variant: "default" as const, text: "Executing" };
    case "completed":
      return { variant: "default" as const, text: "Completed", className: "bg-green-500 text-white hover:bg-green-600" };
    case "failed":
      return { variant: "destructive" as const, text: "Failed" };
    case "target_hit":
      return { variant: "default" as const, text: "Target Hit", className: "bg-green-500 text-white hover:bg-green-600" };
    case "stop_loss":
      return { variant: "destructive" as const, text: "Stop Loss" };
    default:
      return { variant: "secondary" as const, text: status || type };
  }
}

/**
 * Get color classes for event type
 * Pure helper function moved outside component to prevent recreation on every render
 */
function getEventColorClasses(type: string) {
  switch (type) {
    case "completed":
    case "target_hit":
      return "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20";
    case "failed":
    case "stop_loss":
      return "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20";
    case "executing":
    case "parsing":
      return "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20";
    case "parsed":
      return "border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20";
    default:
      return "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/20";
  }
}

/**
 * Get default message for event type
 * Pure helper function moved outside component to prevent recreation on every render
 */
function getDefaultMessage(event: TrackedEvent): string {
  switch (event.type) {
    case "message_received":
      return "New Discord message received";
    case "parsing":
      return `Parsing signal${event.symbol ? ` for ${event.symbol}` : ""}...`;
    case "parsed":
      return `Signal parsed${event.symbol ? `: ${event.symbol}` : ""}`;
    case "executing":
      return `Executing trade${event.symbol ? ` for ${event.symbol}` : ""}...`;
    case "completed":
      return `Trade executed${event.symbol ? ` for ${event.symbol}` : ""}`;
    case "failed":
      return `Processing failed${event.symbol ? ` for ${event.symbol}` : ""}`;
    case "target_hit":
      return `Target hit${event.symbol ? ` for ${event.symbol}` : ""}`;
    case "stop_loss":
      return `Stop loss triggered${event.symbol ? ` for ${event.symbol}` : ""}`;
    default:
      return event.status || "Event received";
  }
}

export function SignalNotificationPanel({ events, onClear }: SignalNotificationPanelProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Live Signal Notifications
          </CardTitle>
          <CardDescription>Real-time updates for Discord signals will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No notifications yet. When signals are detected in your connected Discord channels, you&apos;ll see
              real-time updates here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Live Signal Notifications
              <Badge variant="secondary" className="ml-2">
                {events.length}
              </Badge>
            </CardTitle>
            <CardDescription>Real-time updates for Discord signal processing</CardDescription>
          </div>
          {events.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear all notifications">
              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-3">
            {events.map((event) => {
              const badge = getEventBadge(event.type, event.status);
              const colorClasses = getEventColorClasses(event.type);

              return (
                <div
                  key={event.id}
                  className={`p-4 rounded-lg border transition-colors ${colorClasses}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="mt-1">{getEventIcon(event.type)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={badge.variant} className={badge.className}>
                            {badge.text}
                          </Badge>
                          {event.symbol && (
                            <Badge variant="outline" className="font-mono">
                              {event.symbol}
                            </Badge>
                          )}
                          {event.confidence !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              {event.confidence}% confidence
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(event.displayTimestamp, { addSuffix: true })}
                        </span>
                      </div>

                      {/* Message */}
                      <p className="text-sm font-medium text-foreground mb-1">
                        {event.message || getDefaultMessage(event)}
                      </p>

                      {/* Error */}
                      {event.error && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2 p-2 bg-red-100 dark:bg-red-900/20 rounded">
                          {event.error}
                        </p>
                      )}

                      {/* P&L */}
                      {event.pnlPercentage !== undefined && (
                        <p
                          className={`text-xs font-medium mt-2 ${
                            event.pnlPercentage >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {event.pnlPercentage >= 0 ? "+" : ""}
                          {event.pnlPercentage.toFixed(2)}% P&L
                        </p>
                      )}

                      {/* Action Links */}
                      <div className="flex items-center gap-3 mt-3">
                        {event.signalId && (
                          <Link
                            href={`/signals?signalId=${event.signalId}`}
                            aria-label={`View signal details for ${event.symbol || "this trade"}`}
                          >
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              <FileText className="h-3 w-3 mr-1" aria-hidden="true" />
                              View Signal
                            </Button>
                          </Link>
                        )}
                        {event.tradeId && (
                          <Link
                            href={`/trades?tradeId=${event.tradeId}`}
                            aria-label={`View trade execution for ${event.symbol || "this trade"}`}
                          >
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              <Play className="h-3 w-3 mr-1" aria-hidden="true" />
                              View Trade
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
