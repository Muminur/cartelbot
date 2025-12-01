"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, RefreshCw, Radio, TrendingUp, FileJson, FileText, Eye } from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { safeJsonParse } from "@/lib/utils/api";
import AdminSignalDetailModal from "@/components/admin/AdminSignalDetailModal";
import { AdminSignal } from "@/types";

interface SignalStats {
  pending: number;
  parsed: number;
  executing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// Export configuration constants
const MAX_SIGNALS_PER_BATCH = 500;
const MAX_TOTAL_SIGNALS = 5000;

export default function AdminSignalsPage() {
  const [signals, setSignals] = useState<AdminSignal[]>([]);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedSignal, setSelectedSignal] = useState<AdminSignal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    fetchSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const fetchSignals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        status: statusFilter,
      });

      if (symbolSearch) {
        params.append("symbol", symbolSearch);
      }

      if (userSearch) {
        params.append("userEmail", userSearch);
      }

      const response = await fetch(`/api/admin/signals?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const data = await safeJsonParse<{
        success: boolean;
        data?: AdminSignal[];
        pagination?: { totalPages: number };
        stats?: SignalStats;
        error?: { message: string };
      }>(response, 'Admin Signals - Fetch List');

      if (data.success) {
        setSignals(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        toast.error(data.error?.message || "Failed to load signals");
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Error fetching signals:", error);
      }
      const errorMessage = error instanceof Error ? error.message : "Failed to load signals";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchSignals();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
      case "parsed":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Parsed</Badge>;
      case "executing":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Executing</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSuccessRate = () => {
    if (!stats) return 0;
    const total = stats.completed + stats.failed;
    if (total === 0) return 0;
    return ((stats.completed / total) * 100).toFixed(1);
  };

  const handleViewDetails = (signal: AdminSignal) => {
    setSelectedSignal(signal);
    setIsModalOpen(true);
  };

  /**
   * Fetch signals with pagination and batching to prevent memory exhaustion
   * @returns Array of signals (max 5000 total)
   */
  const fetchAllSignalsWithBatching = async (): Promise<AdminSignal[]> => {
    const allSignals: AdminSignal[] = [];
    let currentPage = 1;
    let hasMore = true;

    try {
      setExportProgress(0);

      while (hasMore && allSignals.length < MAX_TOTAL_SIGNALS) {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: MAX_SIGNALS_PER_BATCH.toString(),
          status: statusFilter,
        });

        if (symbolSearch) {
          params.append("symbol", symbolSearch);
        }

        if (userSearch) {
          params.append("userEmail", userSearch);
        }

        const response = await fetch(`/api/admin/signals?${params.toString()}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
        }

        const data = await safeJsonParse<{
          success: boolean;
          data?: AdminSignal[];
          pagination?: { totalPages: number; page: number; total: number };
          error?: { message: string };
        }>(response, `Admin Signals - Batch ${currentPage}`);

        if (!data.success || !data.data || data.data.length === 0) {
          break;
        }

        // Add signals to array (with limit check)
        const remainingSlots = MAX_TOTAL_SIGNALS - allSignals.length;
        const signalsToAdd = data.data.slice(0, remainingSlots);
        allSignals.push(...signalsToAdd);

        // Update progress
        const progress = data.pagination
          ? Math.min(100, (currentPage / data.pagination.totalPages) * 100)
          : 100;
        setExportProgress(Math.round(progress));

        // Check if we have more pages
        hasMore = data.pagination
          ? currentPage < data.pagination.totalPages
          : false;

        currentPage++;

        // Add small delay between batches to prevent overwhelming the server
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (allSignals.length >= MAX_TOTAL_SIGNALS) {
        toast.warning(`Export limited to ${MAX_TOTAL_SIGNALS} signals for performance`);
      }

      return allSignals;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Error fetching signals for export:", error);
      }
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch signals";
      toast.error(`Export failed: ${errorMessage}`);
      return allSignals; // Return what we've fetched so far
    }
  };

  const handleExportJSON = async () => {
    setExporting(true);
    setExportProgress(0);
    try {
      const allSignals = await fetchAllSignalsWithBatching();

      if (allSignals.length === 0) {
        toast.error("No signals to export");
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        filters: {
          status: statusFilter,
          symbol: symbolSearch || "all",
          user: userSearch || "all",
        },
        totalCount: allSignals.length,
        maxLimit: MAX_TOTAL_SIGNALS,
        signals: allSignals,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `signals-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${allSignals.length} signals to JSON`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to export signals";
      toast.error(errorMessage);
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Export error:", error);
      }
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleExportTXT = async () => {
    setExporting(true);
    setExportProgress(0);
    try {
      const allSignals = await fetchAllSignalsWithBatching();

      if (allSignals.length === 0) {
        toast.error("No signals to export");
        return;
      }

      let txtContent = "CartelBot Signal Export\n";
      txtContent += "=".repeat(80) + "\n";
      txtContent += `Generated: ${new Date().toLocaleString()}\n`;
      txtContent += `Filters: Status=${statusFilter}, Symbol=${symbolSearch || "all"}, User=${userSearch || "all"}\n`;
      txtContent += `Total Signals: ${allSignals.length}\n`;
      txtContent += "=".repeat(80) + "\n\n";

      allSignals.forEach((signal, index) => {
        txtContent += "=".repeat(80) + "\n";
        txtContent += `Signal #${index + 1}\n`;
        txtContent += "=".repeat(80) + "\n";
        txtContent += `ID: ${signal._id}\n`;
        txtContent += `User: ${signal.userEmail} (ID: ${signal.userId})\n`;
        txtContent += `Symbol: ${signal.symbol}\n`;
        txtContent += `Status: ${signal.status.toUpperCase()}\n`;
        txtContent += `Type: ${signal.isImageSignal ? "Image" : "Text"}${
          signal.confidence ? ` (Confidence: ${signal.confidence.toFixed(1)}%)` : ""
        }\n`;
        txtContent += `Created: ${formatDate(signal.createdAt)}\n`;
        txtContent += `Updated: ${formatDate(signal.updatedAt)}\n`;
        txtContent += "\n";

        txtContent += `Entry Range: ${signal.entries.map((e) => e.toFixed(4)).join(", ")}\n`;
        txtContent += `Targets: ${signal.targets.map((t) => t.toFixed(4)).join(", ")}\n`;
        txtContent += `Stop Loss: ${signal.stopLoss.toFixed(4)}\n`;

        if (signal.currentMarketPrice) {
          txtContent += `Market Price at Creation: ${signal.currentMarketPrice.toFixed(4)}\n`;
        }

        txtContent += "\n";
        txtContent += "Raw Signal:\n";
        txtContent += "-".repeat(40) + "\n";
        txtContent += signal.rawSignal + "\n";
        txtContent += "-".repeat(40) + "\n";

        if (signal.imageUrl) {
          txtContent += `Image URL: ${signal.imageUrl}\n`;
        }

        if (signal.parseErrors && signal.parseErrors.length > 0) {
          txtContent += "\nParse Errors:\n";
          signal.parseErrors.forEach((err, i) => {
            txtContent += `  ${i + 1}. ${err}\n`;
          });
        }

        if (signal.executionError) {
          txtContent += "\nExecution Error:\n";
          txtContent += `  Message: ${signal.executionError}\n`;
          if (signal.executionErrorCode) {
            txtContent += `  Code: ${signal.executionErrorCode}\n`;
          }
          if (signal.failureReason) {
            txtContent += `  Reason: ${signal.failureReason}\n`;
          }
          if (signal.executionErrorTimestamp) {
            txtContent += `  Timestamp: ${formatDate(signal.executionErrorTimestamp)}\n`;
          }
        }

        txtContent += "\n";
      });

      const blob = new Blob([txtContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `signals-export-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${allSignals.length} signals to TXT`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to export signals";
      toast.error(errorMessage);
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Export error:", error);
      }
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground dark:text-white">Signal Monitoring</h1>
        <p className="text-muted-foreground dark:text-gray-400 mt-2">
          Monitor all user signals and parsing metrics
        </p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Active Signals
              </CardTitle>
              <Radio className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground dark:text-white">
                {stats.executing}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.pending} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Success Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{getSuccessRate()}%</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.completed} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Failed Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Requires attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                Total Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground dark:text-white">
                {Object.values(stats).reduce((a, b) => a + b, 0)}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All time</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by symbol..."
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by user email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="parsed">Parsed</SelectItem>
                <SelectItem value="executing">Executing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button onClick={fetchSignals} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleExportJSON}
                  variant="outline"
                  disabled={exporting || loading}
                  className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                >
                  {exporting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileJson className="h-4 w-4 mr-2" />
                  )}
                  Export JSON
                </Button>
                <Button
                  onClick={handleExportTXT}
                  variant="outline"
                  disabled={exporting || loading}
                  className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  {exporting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Export TXT
                </Button>
              </div>
              {exporting && exportProgress > 0 && (
                <div className="flex items-center gap-2">
                  <Progress value={exportProgress} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {exportProgress}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signals Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Signals ({totalPages > 0 ? `Page ${page} of ${totalPages}` : "0"})
          </CardTitle>
          <CardDescription>
            Showing {signals.length} signal{signals.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : signals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No signals found</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entry Range</TableHead>
                      <TableHead>Stop Loss</TableHead>
                      <TableHead>Targets</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.map((signal) => (
                      <TableRow key={signal._id}>
                        <TableCell className="font-medium">{signal.userEmail}</TableCell>
                        <TableCell className="font-semibold">{signal.symbol}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {signal.isImageSignal ? "Image" : "Text"}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(signal.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-xs">
                              {signal.entries[0]?.toFixed(4)}
                            </Badge>
                            {signal.entries.length > 1 && (
                              <>
                                <span className="text-gray-400">-</span>
                                <Badge variant="outline" className="text-xs">
                                  {signal.entries[signal.entries.length - 1]?.toFixed(4)}
                                </Badge>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700">
                            {signal.stopLoss.toFixed(4)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{signal.targets.length} targets</Badge>
                        </TableCell>
                        <TableCell>{formatDate(signal.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(signal)}
                            className="h-8 px-2"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground dark:text-gray-400">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || loading}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || loading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Signal Detail Modal */}
      <AdminSignalDetailModal
        signal={selectedSignal}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSignal(null);
        }}
      />
    </div>
  );
}
