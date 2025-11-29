"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

interface CancellationResult {
  orderId: number;
  orderListId: number;
  symbol: string;
  type: "INDIVIDUAL" | "OCO";
  success: boolean;
  error?: string;
}

interface CancellationSummary {
  totalOrders: number;
  totalOCOs: number;
  canceledOrders: number;
  canceledOCOs: number;
  failedOrders: number;
  failedOCOs: number;
  results: CancellationResult[];
  errors: string[];
}

export default function CleanupOrdersPage() {
  const [symbol, setSymbol] = useState("MINAUSDT");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [summary, setSummary] = useState<CancellationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch("/api/admin/cancel-all-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbol: symbol.toUpperCase().trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel orders");
      }

      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const totalProcessed = summary
    ? summary.totalOrders + summary.totalOCOs
    : 0;

  const totalCanceled = summary
    ? summary.canceledOrders + summary.canceledOCOs
    : 0;

  const totalFailed = summary
    ? summary.failedOrders + summary.failedOCOs
    : 0;

  const successRate = totalProcessed > 0
    ? Math.round((totalCanceled / totalProcessed) * 100)
    : 0;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Order Cleanup Tool</h1>
          <p className="text-muted-foreground">
            Cancel all open orders for a specific symbol to free up locked balance.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cancel Open Orders</CardTitle>
            <CardDescription>
              This will cancel ALL open orders (including OCO pairs) for the specified symbol.
              Use with caution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="symbol" className="text-sm font-medium">
                  Trading Symbol
                </label>
                <Input
                  id="symbol"
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="MINAUSDT"
                  className="max-w-md"
                  disabled={loading}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter the symbol (e.g., MINAUSDT, BTCUSDT)
                </p>
              </div>

              <Button type="submit" disabled={loading || !symbol.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Canceling Orders...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancel All Orders
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {summary && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Cancellation Summary</CardTitle>
                <CardDescription>
                  Results for {symbol}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Processed</p>
                    <p className="text-2xl font-bold">{totalProcessed}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Canceled</p>
                    <p className="text-2xl font-bold text-green-600">{totalCanceled}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Failed</p>
                    <p className="text-2xl font-bold text-red-600">{totalFailed}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold">{successRate}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Individual Orders</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-medium">{summary.totalOrders}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Canceled:</span>
                        <span className="font-medium text-green-600">{summary.canceledOrders}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Failed:</span>
                        <span className="font-medium text-red-600">{summary.failedOrders}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">OCO Orders</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-medium">{summary.totalOCOs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Canceled:</span>
                        <span className="font-medium text-green-600">{summary.canceledOCOs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Failed:</span>
                        <span className="font-medium text-red-600">{summary.failedOCOs}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {summary.errors.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Errors:</p>
                    <div className="space-y-1">
                      {summary.errors.map((err, idx) => (
                        <Alert key={idx} variant="destructive" className="py-2">
                          <AlertDescription className="text-sm">{err}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {summary.results.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Results</CardTitle>
                  <CardDescription>
                    Individual order cancellation results
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>OCO ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.results.map((result, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">
                            {result.orderId}
                          </TableCell>
                          <TableCell>
                            <Badge variant={result.type === "OCO" ? "default" : "secondary"}>
                              {result.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {result.orderListId !== -1 ? result.orderListId : "—"}
                          </TableCell>
                          <TableCell>
                            {result.success ? (
                              <div className="flex items-center text-green-600">
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                <span className="text-sm">Canceled</span>
                              </div>
                            ) : (
                              <div className="flex items-center text-red-600">
                                <XCircle className="h-4 w-4 mr-1" />
                                <span className="text-sm">Failed</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {result.error || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Button
              onClick={() => {
                setSummary(null);
                setError(null);
              }}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Clear Results
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order Cancellation</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to cancel <strong>ALL open orders</strong> for <strong>{symbol}</strong>.
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone. All pending orders and OCO pairs will be canceled immediately.
              </p>
              <p>
                Are you sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>
              Yes, Cancel All Orders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
