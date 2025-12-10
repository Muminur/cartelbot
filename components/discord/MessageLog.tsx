"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, XCircle, RefreshCw, Hash, User } from "lucide-react";
import { IDiscordMessage } from "@/types/discord";
import { formatDistanceToNow, format } from "date-fns";

interface MessageLogProps {
  messages: IDiscordMessage[];
  onRefresh: () => void;
}

const statusConfig: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  },
  processing: {
    label: "Processing",
    icon: Clock,
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  parsed: {
    label: "Parsed",
    icon: CheckCircle2,
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  },
  executed: {
    label: "Executed",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  ignored: {
    label: "Ignored",
    icon: XCircle,
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  },
  error: {
    label: "Error",
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
};

export function MessageLog({ messages, onRefresh }: MessageLogProps) {
  const [selectedMessage, setSelectedMessage] = useState<IDiscordMessage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const messagesPerPage = 10;

  const totalPages = Math.ceil(messages.length / messagesPerPage);
  const startIndex = (currentPage - 1) * messagesPerPage;
  const endIndex = startIndex + messagesPerPage;
  const currentMessages = messages.slice(startIndex, endIndex);

  const truncateContent = (content: string, maxLength: number = 50) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  };

  const MessageStatus = ({ status }: { status: IDiscordMessage["processingStatus"] }) => {
    const config = statusConfig[status] || statusConfig.pending; // Fallback to pending if status not found
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Messages</h3>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {messages.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No messages received yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Messages will appear here as they are received from Discord
            </p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Message</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentMessages.map((message) => (
                    <TableRow
                      key={String(message._id)}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedMessage(message)}
                    >
                      <TableCell className="font-mono text-sm">
                        {truncateContent(message.content)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{message.connection?.channelName || message.channelId}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{message.authorUsername}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <MessageStatus status={message.processingStatus} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, messages.length)} of{" "}
                  {messages.length} messages
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message Details</DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {selectedMessage && (
                  <>
                    <span>#{selectedMessage.connection?.channelName || selectedMessage.channelId}</span>
                    <span>•</span>
                    <span>{format(new Date(selectedMessage.timestamp), "PPpp")}</span>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Status</h4>
                <MessageStatus status={selectedMessage.processingStatus} />
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Author</h4>
                <p className="text-sm">{selectedMessage.authorUsername}</p>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Content</h4>
                <div className="bg-muted rounded-lg p-3">
                  <pre className="text-sm whitespace-pre-wrap font-mono">
                    {selectedMessage.content}
                  </pre>
                </div>
              </div>

              {(selectedMessage.signalId || selectedMessage.parsedSignal) && (
                <div>
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
                    Trading Signal Detected
                  </Badge>
                  {selectedMessage.parsedSignal && (
                    <div className="mt-2 text-sm">
                      <p><strong>Symbol:</strong> {selectedMessage.parsedSignal.symbol}</p>
                      <p><strong>Confidence:</strong> {selectedMessage.parsedSignal.confidence}%</p>
                    </div>
                  )}
                </div>
              )}

              {selectedMessage.parseErrors && selectedMessage.parseErrors.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-destructive">Parse Errors</h4>
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <ul className="text-sm text-destructive space-y-1">
                      {selectedMessage.parseErrors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedMessage.executionError && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-destructive">Execution Error</h4>
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <p className="text-sm text-destructive">{selectedMessage.executionError}</p>
                  </div>
                </div>
              )}

              {selectedMessage.signalId && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Signal ID</h4>
                  <p className="text-sm font-mono">{selectedMessage.signalId}</p>
                </div>
              )}

              {selectedMessage.tradeId && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Trade ID</h4>
                  <p className="text-sm font-mono">{selectedMessage.tradeId}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
