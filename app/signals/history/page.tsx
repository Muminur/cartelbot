"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SignalFilters, { SignalFilterValues } from "@/components/signals/SignalFilters";
import SignalDetailModal from "@/components/signals/SignalDetailModal";
import EditSignalModal from "@/components/signals/EditSignalModal";
import DeleteSignalDialog from "@/components/signals/DeleteSignalDialog";
import SignalActions from "@/components/signals/SignalActions";
import { ISignal, UserProfile } from "@/types";
import { API_ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import { ArrowLeft, RefreshCw, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-yellow-500";
    case "parsed":
      return "bg-blue-500";
    case "executing":
      return "bg-purple-500";
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "cancelled":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
};

export default function SignalHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [signals, setSignals] = useState<ISignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<SignalFilterValues>({
    symbol: "",
    status: "all",
    signalType: "all",
    dateFrom: "",
    dateTo: "",
  });

  const [selectedSignal, setSelectedSignal] = useState<ISignal | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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
      }
    };

    fetchSession();
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchSignals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, filters]);

  // Handle highlight parameter from URL
  useEffect(() => {
    if (signals.length > 0 && searchParams) {
      const highlightId = searchParams.get("highlight");
      if (highlightId) {
        const highlightedSignal = signals.find(
          (signal) => String(signal._id) === highlightId
        );
        if (highlightedSignal) {
          setSelectedSignal(highlightedSignal);
          setDetailModalOpen(true);

          // Remove highlight parameter from URL after opening modal
          const newUrl = window.location.pathname;
          window.history.replaceState({}, "", newUrl);
        }
      }
    }
  }, [signals, searchParams]);

  const fetchSignals = async () => {
    if (page === 1) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      if (filters.symbol) {
        params.append("symbol", filters.symbol);
      }

      if (filters.status && filters.status !== "all") {
        params.append("status", filters.status);
      }

      if (filters.signalType && filters.signalType !== "all") {
        params.append("isImageSignal", filters.signalType === "image" ? "true" : "false");
      }

      if (filters.dateFrom) {
        params.append("dateFrom", filters.dateFrom);
      }

      if (filters.dateTo) {
        params.append("dateTo", filters.dateTo);
      }

      const response = await fetch(`${API_ROUTES.SIGNALS.LIST}?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setSignals(data.data);
        setTotalPages(data.pagination.totalPages);
      } else {
        toast.error("Failed to fetch signals");
      }
    } catch (error) {
      console.error("Failed to fetch signals:", error);
      toast.error("An error occurred while fetching signals");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleFilterChange = (newFilters: SignalFilterValues) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleRefresh = () => {
    fetchSignals();
  };

  const handleViewDetails = (signal: ISignal) => {
    setSelectedSignal(signal);
    setDetailModalOpen(true);
  };

  const handleEdit = (signal: ISignal) => {
    setSelectedSignal(signal);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (signalId: string, updatedSignal: string) => {
    try {
      const response = await fetch(`/api/signals/${signalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawSignal: updatedSignal }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to update signal");
      }

      toast.success("Signal updated successfully");
      fetchSignals();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update signal";
      toast.error(message);
      throw error;
    }
  };

  const handleCancel = async (signalId: string) => {
    try {
      const response = await fetch(`/api/signals/${signalId}/cancel`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to cancel signal");
      }

      toast.success("Signal cancelled successfully");
      fetchSignals();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel signal";
      toast.error(message);
    }
  };

  const handleExecute = (signal: ISignal) => {
    router.push(`/trades/execute?signalId=${signal._id}`);
  };

  const handleDelete = (signal: ISignal) => {
    setSelectedSignal(signal);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (signalId: string, sellRemaining: boolean) => {
    try {
      const response = await fetch(`/api/signals/${signalId}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellRemaining }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete signal");
      }

      toast.success(data.data.message || "Signal deleted successfully");
      fetchSignals();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete signal";
      toast.error(message);
      throw error;
    }
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-white">CB</span>
              </div>
              <span className="text-xl font-bold">CartelBot</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" onClick={() => router.push("/signals")}>
                Submit Signal
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
                Dashboard
              </Button>
              {user && <span className="text-sm text-gray-600">{user.email}</span>}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/signals")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Signal History</h1>
              <p className="text-gray-600 mt-1">View and manage all your submitted signals</p>
            </div>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="space-y-6">
          <SignalFilters onFilterChange={handleFilterChange} isLoading={loading} />

          <Card>
            <CardHeader>
              <CardTitle>Signals</CardTitle>
              <CardDescription>
                {signals.length} signal{signals.length !== 1 ? "s" : ""} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                </div>
              ) : signals.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No signals found</p>
                  <Button onClick={() => router.push("/signals")} className="mt-4">
                    Submit Your First Signal
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Entries</TableHead>
                          <TableHead>Targets</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {signals.map((signal) => (
                          <TableRow key={String(signal._id)}>
                            <TableCell className="font-medium">
                              {formatDate(signal.createdAt)}
                            </TableCell>
                            <TableCell className="font-semibold">{signal.symbol}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {signal.isImageSignal ? (
                                  <ImageIcon className="h-4 w-4 text-purple-500" />
                                ) : (
                                  <FileText className="h-4 w-4 text-blue-500" />
                                )}
                                <span className="text-sm">
                                  {signal.isImageSignal ? "Image" : "Text"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="default"
                                className={getStatusBadgeVariant(signal.status)}
                              >
                                {signal.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {signal.entries.slice(0, 2).map((entry, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {entry.toFixed(4)}
                                  </Badge>
                                ))}
                                {signal.entries.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{signal.entries.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {signal.targets.slice(0, 2).map((target, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {target.toFixed(4)}
                                  </Badge>
                                ))}
                                {signal.targets.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{signal.targets.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <SignalActions
                                signal={signal}
                                onViewDetails={handleViewDetails}
                                onEdit={handleEdit}
                                onCancel={(s) => handleCancel(String(s._id))}
                                onExecute={handleExecute}
                                onDelete={handleDelete}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-gray-600">
                        Page {page} of {totalPages}
                      </p>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1 || refreshing}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages || refreshing}
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
      </main>

      <SignalDetailModal
        signal={selectedSignal}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedSignal(null);
        }}
        onEdit={handleEdit}
        onCancel={handleCancel}
        onExecute={handleExecute}
      />

      <EditSignalModal
        signal={selectedSignal}
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedSignal(null);
        }}
        onSave={handleSaveEdit}
      />

      <DeleteSignalDialog
        signal={selectedSignal}
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedSignal(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
