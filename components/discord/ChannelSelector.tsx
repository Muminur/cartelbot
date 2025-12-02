"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { DiscordChannel } from "@/types/discord";

interface ChannelSelectorProps {
  serverId: string;
  token: string;
  onSelect: (channelId: string, channelName: string) => void;
  disabled?: boolean;
}

const CHANNEL_TYPE_TEXT = 0;

export function ChannelSelector({ serverId, token, onSelect, disabled }: ChannelSelectorProps) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");

  useEffect(() => {
    if (!serverId || !token || token.length < 50) {
      setChannels([]);
      setSelectedChannelId("");
      return;
    }

    const fetchChannels = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/discord/channels/${serverId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok && data.channels) {
          // Filter to text channels only
          const textChannels = data.channels.filter(
            (channel: DiscordChannel) => channel.type === CHANNEL_TYPE_TEXT
          );
          setChannels(textChannels);

          if (textChannels.length === 0) {
            toast.info("No text channels found in this server");
          }
        } else {
          toast.error(data.error || "Failed to fetch Discord channels");
          setChannels([]);
        }
      } catch (error) {
        toast.error("Failed to load channels. Please try again.");
        setChannels([]);
        if (process.env.NODE_ENV === "development") {
          console.error("Channel fetch error:", error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchChannels();
  }, [serverId, token]);

  const handleSelectChange = (value: string) => {
    setSelectedChannelId(value);
    const channel = channels.find((c) => c.id === value);
    if (channel) {
      onSelect(channel.id, channel.name);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Discord Channel</Label>
        <Skeleton className="h-10 w-full" />
        <p className="text-sm text-muted-foreground">Loading channels...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="discord-channel">Discord Channel</Label>
      <Select
        value={selectedChannelId}
        onValueChange={handleSelectChange}
        disabled={disabled || !serverId || channels.length === 0}
      >
        <SelectTrigger id="discord-channel" aria-label="Select Discord Channel">
          <SelectValue placeholder="Select a channel" />
        </SelectTrigger>
        <SelectContent>
          {channels.length === 0 ? (
            <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>No text channels found</span>
            </div>
          ) : (
            channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  <span>{channel.name}</span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        {!serverId
          ? "Select a server first"
          : channels.length > 0
          ? `Found ${channels.length} text channel${channels.length === 1 ? "" : "s"}`
          : "No text channels available"}
      </p>
    </div>
  );
}
