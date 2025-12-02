"use client";

import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Pause,
  XCircle,
  Ban,
  Clock,
  
} from "lucide-react";

interface ConnectionStatusProps {
  status: "active" | "paused" | "error" | "banned" | "expired";
}

const statusConfig = {
  active: {
    label: "Active",
    icon: Activity,
    className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  paused: {
    label: "Paused",
    icon: Pause,
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  },
  error: {
    label: "Error",
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  banned: {
    label: "Banned",
    icon: Ban,
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  expired: {
    label: "Expired",
    icon: Clock,
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  },
};

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

export function ConnectionStatusDot({ status }: ConnectionStatusProps) {
  const colorClass =
    status === "active"
      ? "bg-green-500"
      : status === "paused"
      ? "bg-yellow-500"
      : status === "error" || status === "banned"
      ? "bg-red-500"
      : "bg-gray-500";

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${colorClass} animate-pulse`} />
      <span className="text-sm text-muted-foreground capitalize">{status}</span>
    </div>
  );
}
