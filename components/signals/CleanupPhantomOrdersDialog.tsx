"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ISignal } from "@/types";
import { AlertTriangle, CheckCircle2, Loader2, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PhantomOrder {
  orderId: number;
  orderListId?: number;
  type: string;
  side: string;
  quantity: string;
  price: string;
  status: string;
  stopPrice?: string;
}

interface PreviewData {
  phantomOrders: PhantomOrder[];
  totalOrders: number;
  totalQuantity: string;
  baseAsset: string;
}

interface CleanupResult {
  success: boolean;
  cancelledOrders: Array<{
    orderId: number;
    type: string;
    quantity: string;
  }>;
  failedOrders: Array<{
    orderId: number;
    type: string;
    error: string;
  }>;
  totalFreedQuantity: string;
  baseAsset: string;
  message?: string;
}

interface CleanupPhantomOrdersDialogProps {
  signal: ISignal | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CleanupPhantomOrdersDialog({
  signal,
  isOpen,
  onClose,
  onSuccess,
}: CleanupPhantomOrdersDialogProps) {
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch preview when dialog opens
  useEffect(() => {
    if (isOpen && signal) {
      fetchPreview();
    } else {
      // Reset state when dialog closes
      setPreview(null);
      setResult(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, signal]);

  const fetchPreview = async () => {
    if (!signal) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/signals/${signal._id}/cleanup-phantom-orders`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to fetch preview");
      }

      setPreview(data.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load preview";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!signal) return;

    setCleaning(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/signals/${signal._id}/cleanup-phantom-orders`,
        {
          method: "POST",
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to cleanup orders");
      }

      setResult(data.data);

      // Show success message
      if (data.data.cancelledOrders.length > 0) {
        toast.success(
          `Successfully cancelled ${data.data.cancelledOrders.length} order(s), freed ${data.data.totalFreedQuantity} ${data.data.baseAsset}`
        );
      } else {
        toast.info(data.data.message || "No phantom orders found");
      }

      // Call success callback after a short delay
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cleanup orders";
      setError(message);
      toast.error(message);
    } finally {
      setCleaning(false);
    }
  };

  const handleClose = () => {
    if (!cleaning) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-yellow-600" />
            Cleanup Phantom Orders
          </DialogTitle>
          <DialogDescription>
            Remove stuck orders from Binance for {signal?.symbol}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <span className="ml-3 text-gray-600">Loading orders...</span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Preview State */}
          {preview && !result && !loading && (
            <>
              {preview.totalOrders === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    No phantom orders found. All orders have been properly closed or
                    there are no open orders for this signal.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Alert className="border-yellow-500 bg-yellow-50">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-900">
                      Found <strong>{preview.totalOrders}</strong> phantom order
                      {preview.totalOrders !== 1 ? "s" : ""} totaling{" "}
                      <strong>
                        {preview.totalQuantity} {preview.baseAsset}
                      </strong>
                      . These orders will be cancelled and the assets will be freed.
                    </AlertDescription>
                  </Alert>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Side</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.phantomOrders.map((order) => (
                          <TableRow key={order.orderId}>
                            <TableCell className="font-mono text-sm">
                              {order.orderId}
                              {order.orderListId && (
                                <div className="text-xs text-gray-500">
                                  OCO: {order.orderListId}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {order.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={order.side === "BUY" ? "default" : "secondary"}
                                className={
                                  order.side === "BUY"
                                    ? "bg-green-500"
                                    : "bg-red-500"
                                }
                              >
                                {order.side}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {parseFloat(order.quantity).toFixed(8)}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {parseFloat(order.price).toFixed(4)}
                                {order.stopPrice && (
                                  <div className="text-xs text-gray-500">
                                    Stop: {parseFloat(order.stopPrice).toFixed(4)}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{order.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <Alert className="border-red-500 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-900">
                      <strong>Warning:</strong> This action cannot be undone. All
                      listed orders will be cancelled on Binance and the signal will
                      be marked as failed.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </>
          )}

          {/* Result State */}
          {result && !loading && (
            <div className="space-y-4">
              {result.cancelledOrders.length > 0 && (
                <>
                  <Alert className="border-green-500 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-900">
                      Successfully cancelled <strong>{result.cancelledOrders.length}</strong>{" "}
                      order{result.cancelledOrders.length !== 1 ? "s" : ""} and freed{" "}
                      <strong>
                        {result.totalFreedQuantity} {result.baseAsset}
                      </strong>
                    </AlertDescription>
                  </Alert>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.cancelledOrders.map((order) => (
                          <TableRow key={order.orderId}>
                            <TableCell className="font-mono text-sm">
                              {order.orderId}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {order.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {parseFloat(order.quantity).toFixed(8)}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-green-500">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Cancelled
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {result.failedOrders.length > 0 && (
                <>
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to cancel <strong>{result.failedOrders.length}</strong>{" "}
                      order{result.failedOrders.length !== 1 ? "s" : ""}
                    </AlertDescription>
                  </Alert>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.failedOrders.map((order) => (
                          <TableRow key={order.orderId}>
                            <TableCell className="font-mono text-sm">
                              {order.orderId}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {order.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-red-600 text-sm">
                              {order.error}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {result.message && result.cancelledOrders.length === 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={cleaning}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCleanup}
                disabled={
                  loading ||
                  cleaning ||
                  !preview ||
                  preview.totalOrders === 0 ||
                  !!error
                }
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                {cleaning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cleaning up...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Confirm Cleanup
                  </>
                )}
              </Button>
            </>
          )}
          {result && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
