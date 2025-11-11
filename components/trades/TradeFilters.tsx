"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

export interface TradeFilterValues {
  symbol?: string;
  status?: string;
  closeReason?: string;
  pnlFilter?: "all" | "positive" | "negative";
  dateFrom?: string;
  dateTo?: string;
}

interface TradeFiltersProps {
  onFilterChange: (filters: TradeFilterValues) => void;
  initialFilters?: TradeFilterValues;
  showCloseReason?: boolean; // Show close reason filter for history
  statusOptions?: Array<{ value: string; label: string }>; // Different statuses for active vs history
}

export function TradeFilters({
  onFilterChange,
  initialFilters = {},
  showCloseReason = false,
  statusOptions = [
    { value: "all", label: "All" },
    { value: "open", label: "Open" },
    { value: "partial", label: "Partial" },
    { value: "closed", label: "Closed" },
    { value: "cancelled", label: "Cancelled" },
  ],
}: TradeFiltersProps) {
  const [filters, setFilters] = useState<TradeFilterValues>(initialFilters);

  const handleFilterChange = (key: keyof TradeFilterValues, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleReset = () => {
    const emptyFilters: TradeFilterValues = {};
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  const hasActiveFilters = Object.keys(filters).some((key) => {
    const value = filters[key as keyof TradeFilterValues];
    return value !== undefined && value !== "" && value !== "all";
  });

  return (
    <div className="bg-white p-4 rounded-lg border space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2 lg:px-3"
          >
            <X className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Symbol Search */}
        <div className="space-y-2">
          <Label htmlFor="symbol-filter" className="text-xs">
            Symbol
          </Label>
          <Input
            id="symbol-filter"
            placeholder="e.g., BTCUSDT"
            value={filters.symbol || ""}
            onChange={(e) => handleFilterChange("symbol", e.target.value.toUpperCase())}
            className="h-9"
          />
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label htmlFor="status-filter" className="text-xs">
            Status
          </Label>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) => handleFilterChange("status", value)}
          >
            <SelectTrigger id="status-filter" className="h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* P&L Filter */}
        <div className="space-y-2">
          <Label htmlFor="pnl-filter" className="text-xs">
            P&L
          </Label>
          <Select
            value={filters.pnlFilter || "all"}
            onValueChange={(value) => handleFilterChange("pnlFilter", value)}
          >
            <SelectTrigger id="pnl-filter" className="h-9">
              <SelectValue placeholder="All P&L" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Close Reason Filter (for history only) */}
        {showCloseReason && (
          <div className="space-y-2">
            <Label htmlFor="close-reason-filter" className="text-xs">
              Close Reason
            </Label>
            <Select
              value={filters.closeReason || "all"}
              onValueChange={(value) => handleFilterChange("closeReason", value)}
            >
              <SelectTrigger id="close-reason-filter" className="h-9">
                <SelectValue placeholder="All reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="target">Target</SelectItem>
                <SelectItem value="stop_loss">Stop Loss</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Date From */}
        <div className="space-y-2">
          <Label htmlFor="date-from-filter" className="text-xs">
            From Date
          </Label>
          <Input
            id="date-from-filter"
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            className="h-9"
          />
        </div>

        {/* Date To */}
        <div className="space-y-2">
          <Label htmlFor="date-to-filter" className="text-xs">
            To Date
          </Label>
          <Input
            id="date-to-filter"
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}
