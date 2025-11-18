"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Search, RefreshCw, Radio, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils/format";

interface Signal {
  _id: string;
  userEmail: string;
  symbol: string;
  entries: number[];
  targets: number[];
  stopLoss: number;
  status: string;
  isImageSignal: boolean;
  confidence?: number;
  createdAt: Date;
}

interface SignalStats {
  pending: number;
  parsed: number;
  executing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export default function AdminSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

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
      const data = await response.json();

      if (data.success) {
        setSignals(data.data);
        setTotalPages(data.pagination.totalPages);
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        toast.error(data.error?.message || "Failed to load signals");
      }
    } catch (error) {
      console.error("Error fetching signals:", error);
      toast.error("Failed to load signals");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Signal Monitoring</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Monitor all user signals and parsing metrics
        </p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Active Signals
              </CardTitle>
              <Radio className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.executing}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.pending} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
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
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
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
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
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
    </div>
  );
}
