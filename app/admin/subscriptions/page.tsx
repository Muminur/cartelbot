"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CheckCircle2, XCircle, Clock, ExternalLink, Loader2 } from "lucide-react";
import { API_ROUTES } from "@/lib/constants";

interface Subscription {
  _id: string;
  userId: string;
  tier: "premium" | "pro";
  amount: number;
  currency: "USDT";
  txHash?: string;
  fromAddress?: string;
  status: "pending" | "confirmed" | "expired" | "cancelled";
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  userEmail: string;
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(API_ROUTES.AUTH.SESSION);
      const data = await response.json();

      if (!data.success || !data.data.user) {
        router.push("/login");
        return;
      }

      setUserEmail(data.data.user.email);
    } catch (error) {
      console.error("Auth check failed:", error);
      router.push("/login");
    }
  }, [router]);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/subscriptions?status=${filter}`);
      const data = await response.json();

      if (data.success) {
        setSubscriptions(data.data);
      } else if (data.error?.statusCode === 403) {
        toast.error("Admin access required");
        router.push("/dashboard");
      } else {
        toast.error("Failed to load subscriptions");
      }
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [filter, router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (userEmail) {
      fetchSubscriptions();
    }
  }, [filter, userEmail, fetchSubscriptions]);

  const handleApprove = async (subscriptionId: string) => {
    setProcessingId(subscriptionId);
    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Subscription approved successfully");
        await fetchSubscriptions(); // Refresh list
      } else {
        toast.error(data.error?.message || "Failed to approve subscription");
      }
    } catch (error) {
      console.error("Error approving subscription:", error);
      toast.error("Failed to approve subscription");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (subscriptionId: string) => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    setProcessingId(subscriptionId);
    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          reason: rejectionReason,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Subscription rejected");
        setRejectionReason("");
        setSelectedId(null);
        await fetchSubscriptions(); // Refresh list
      } else {
        toast.error(data.error?.message || "Failed to reject subscription");
      }
    } catch (error) {
      console.error("Error rejecting subscription:", error);
      toast.error("Failed to reject subscription");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" /> Pending
          </Badge>
        );
      case "confirmed":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmed
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <XCircle className="h-3 w-3 mr-1" /> Expired
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" /> Cancelled
          </Badge>
        );
    }
  };

  return (
    <DashboardLayout userEmail={userEmail}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Subscription Management</h1>
          <p className="text-gray-600 mt-2">Review and approve user subscription payments</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => setFilter("pending")}
          >
            Pending
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All Subscriptions
          </Button>
        </div>

        {/* Subscriptions List */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </CardContent>
          </Card>
        ) : subscriptions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">No {filter === "pending" ? "pending" : ""} subscriptions found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((sub) => (
              <Card key={sub._id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="capitalize">{sub.tier} Plan</CardTitle>
                      <CardDescription>{sub.userEmail}</CardDescription>
                    </div>
                    {getStatusBadge(sub.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Payment Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Amount:</span>
                        <span className="ml-2 font-semibold">
                          ${sub.amount} {sub.currency}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Submitted:</span>
                        <span className="ml-2">{new Date(sub.createdAt).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Start Date:</span>
                        <span className="ml-2">{new Date(sub.startDate).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">End Date:</span>
                        <span className="ml-2">{new Date(sub.endDate).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Transaction Details */}
                    {sub.txHash && (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="text-sm">
                          <span className="text-gray-500">Transaction Hash:</span>
                          <div className="font-mono text-xs mt-1 break-all">
                            {sub.txHash}
                            <a
                              href={`https://tronscan.org/#/transaction/${sub.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 inline-flex items-center text-blue-500 hover:text-blue-700"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View on TronScan
                            </a>
                          </div>
                        </div>
                        {sub.fromAddress && (
                          <div className="text-sm">
                            <span className="text-gray-500">From Address:</span>
                            <div className="font-mono text-xs mt-1">{sub.fromAddress}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    {sub.status === "pending" && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="default"
                          onClick={() => handleApprove(sub._id)}
                          disabled={processingId === sub._id}
                          className="flex-1"
                        >
                          {processingId === sub._id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedId(selectedId === sub._id ? null : sub._id)}
                          disabled={processingId === sub._id}
                          className="flex-1"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {/* Rejection Form */}
                    {selectedId === sub._id && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label>Rejection Reason</Label>
                        <Input
                          placeholder="Enter reason for rejection..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            onClick={() => handleReject(sub._id)}
                            disabled={processingId === sub._id || !rejectionReason.trim()}
                            className="flex-1"
                          >
                            Confirm Rejection
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedId(null);
                              setRejectionReason("");
                            }}
                            disabled={processingId === sub._id}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
