"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Signal } from "lucide-react";

interface SignalData {
  _id: string;
  symbol: string;
  status: string;
  createdAt: string;
}

export function ActiveSignalsWidget() {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const response = await fetch("/api/signals?status=pending,executing&limit=5");
        const data = await response.json();
        if (data.success) {
          setSignals(data.data.signals || []);
        }
      } catch (error) {
        console.error("Error fetching signals:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Signal className="w-5 h-5" />
            Active Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Signal className="w-5 h-5" />
          Active Signals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active signals
          </p>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <div
                key={signal._id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div>
                  <p className="font-medium text-foreground">{signal.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(signal.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={signal.status === "executing" ? "default" : "secondary"}>
                  {signal.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
