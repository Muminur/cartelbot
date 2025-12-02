"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConnectionStatus } from "./ConnectionStatus";
import {  Hash, Pause, Play, Settings, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { IDiscordConnection } from "@/types/discord";
import { formatDistanceToNow } from "date-fns";

interface ConnectionCardProps {
  connection: IDiscordConnection;
  onUpdate: () => void;
}

export function ConnectionCard({ connection, onUpdate }: ConnectionCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [autoExecute, setAutoExecute] = useState(connection.autoExecute);
  const [requireConfirmation, setRequireConfirmation] = useState(connection.requireConfirmation);

  const handlePauseResume = async () => {
    setIsUpdating(true);
    try {
      const newStatus = connection.status === "active" ? "paused" : "active";
      const response = await fetch(`/api/discord/connections/${connection._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Connection ${newStatus === "active" ? "resumed" : "paused"} successfully`);
        onUpdate();
      } else {
        toast.error(data.error || "Failed to update connection");
      }
    } catch (error) {
      toast.error("Failed to update connection. Please try again.");
      if (process.env.NODE_ENV === "development") {
        console.error("Connection update error:", error);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/discord/connections/${connection._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoExecute, requireConfirmation }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Settings updated successfully");
        setShowSettings(false);
        onUpdate();
      } else {
        toast.error(data.error || "Failed to update settings");
      }
    } catch (error) {
      toast.error("Failed to update settings. Please try again.");
      if (process.env.NODE_ENV === "development") {
        console.error("Settings update error:", error);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/discord/connections/${connection._id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Connection deleted successfully");
        setShowDeleteDialog(false);
        onUpdate();
      } else {
        toast.error(data.error || "Failed to delete connection");
      }
    } catch (error) {
      toast.error("Failed to delete connection. Please try again.");
      if (process.env.NODE_ENV === "development") {
        console.error("Connection delete error:", error);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const lastMessageText = connection.lastMessageAt
    ? `${formatDistanceToNow(new Date(connection.lastMessageAt))} ago`
    : "No messages yet";

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ConnectionStatus status={connection.status} />
                <CardTitle className="text-lg">{connection.serverName}</CardTitle>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Hash className="h-3 w-3" />
                {connection.channelName}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 py-2 border-y border-border">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Processed</p>
              <p className="text-lg font-semibold">{connection.processedMessageCount} signals</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Executed</p>
              <p className="text-lg font-semibold">{connection.executedTradeCount} trades</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last message:</span>
              <span className="font-medium">{lastMessageText}</span>
            </div>
            {connection.lastError && connection.status === "error" && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
                <p className="text-xs text-destructive">{connection.lastError}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 py-2 border-y border-border">
            <div className="flex items-center gap-2">
              {connection.autoExecute ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-500" />
              )}
              <span className="text-sm">Auto-execute</span>
            </div>
            <div className="flex items-center gap-2">
              {connection.requireConfirmation ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-500" />
              )}
              <span className="text-sm">Confirmation</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseResume}
              disabled={isUpdating || connection.status === "banned"}
              className="flex-1"
            >
              {connection.status === "active" ? (
                <>
                  <Pause className="h-4 w-4 mr-1" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              disabled={isUpdating}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isUpdating}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connection Settings</DialogTitle>
            <DialogDescription>
              Configure how this connection handles signals
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-execute">Auto-execute trades</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically execute parsed signals
                </p>
              </div>
              <Switch
                id="auto-execute"
                checked={autoExecute}
                onCheckedChange={setAutoExecute}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="require-confirmation">Require confirmation</Label>
                <p className="text-sm text-muted-foreground">
                  Ask for confirmation before executing trades
                </p>
              </div>
              <Switch
                id="require-confirmation"
                checked={requireConfirmation}
                onCheckedChange={setRequireConfirmation}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={isUpdating}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this Discord connection?
              This will stop monitoring <strong>#{connection.channelName}</strong> in{" "}
              <strong>{connection.serverName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isUpdating}
            >
              Delete Connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
