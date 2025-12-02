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
import { Server, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { DiscordGuild } from "@/types/discord";

interface ServerSelectorProps {
  token: string;
  onSelect: (serverId: string, serverName: string) => void;
  disabled?: boolean;
}

export function ServerSelector({ token, onSelect, disabled }: ServerSelectorProps) {
  const [servers, setServers] = useState<DiscordGuild[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string>("");

  useEffect(() => {
    if (!token || token.length < 50) {
      setServers([]);
      return;
    }

    const fetchServers = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/discord/guilds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok && data.guilds) {
          setServers(data.guilds);
          if (data.guilds.length === 0) {
            toast.info("No servers found for this Discord account");
          }
        } else {
          toast.error(data.error || "Failed to fetch Discord servers");
          setServers([]);
        }
      } catch (error) {
        toast.error("Failed to load servers. Please try again.");
        setServers([]);
        if (process.env.NODE_ENV === "development") {
          console.error("Server fetch error:", error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchServers();
  }, [token]);

  const handleSelectChange = (value: string) => {
    setSelectedServerId(value);
    const server = servers.find((s) => s.id === value);
    if (server) {
      onSelect(server.id, server.name);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Discord Server</Label>
        <Skeleton className="h-10 w-full" />
        <p className="text-sm text-muted-foreground">Loading servers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="discord-server">Discord Server</Label>
      <Select
        value={selectedServerId}
        onValueChange={handleSelectChange}
        disabled={disabled || servers.length === 0}
      >
        <SelectTrigger id="discord-server" aria-label="Select Discord Server">
          <SelectValue placeholder="Select a server" />
        </SelectTrigger>
        <SelectContent>
          {servers.length === 0 ? (
            <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>No servers found</span>
            </div>
          ) : (
            servers.map((server) => (
              <SelectItem key={server.id} value={server.id}>
                <div className="flex items-center gap-2">
                  {server.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`}
                      alt={server.name}
                      className="h-4 w-4 rounded-full"
                    />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                  <span>{server.name}</span>
                  {server.owner && (
                    <span className="text-xs text-muted-foreground">(Owner)</span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        {servers.length > 0
          ? `Found ${servers.length} server${servers.length === 1 ? "" : "s"}`
          : "Connect a valid token to see servers"}
      </p>
    </div>
  );
}
