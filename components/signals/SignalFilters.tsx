"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Search, X } from "lucide-react";

interface SignalFiltersProps {
  onFilterChange: (filters: SignalFilterValues) => void;
  isLoading?: boolean;
}

export interface SignalFilterValues {
  symbol: string;
  status: string;
  signalType: string;
  dateFrom: string;
  dateTo: string;
}

export default function SignalFilters({ onFilterChange, isLoading = false }: SignalFiltersProps) {
  const [filters, setFilters] = useState<SignalFilterValues>({
    symbol: "",
    status: "all",
    signalType: "all",
    dateFrom: "",
    dateTo: "",
  });

  const handleFilterChange = (key: keyof SignalFilterValues, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    onFilterChange(filters);
  };

  const handleResetFilters = () => {
    const resetFilters: SignalFilterValues = {
      symbol: "",
      status: "all",
      signalType: "all",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  const hasActiveFilters =
    filters.symbol !== "" ||
    filters.status !== "all" ||
    filters.signalType !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label htmlFor="symbol-filter">Symbol</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="symbol-filter"
                type="text"
                placeholder="e.g. BTCUSDT"
                value={filters.symbol}
                onChange={(e) => handleFilterChange("symbol", e.target.value.toUpperCase())}
                className="pl-8"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-filter">Status</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => handleFilterChange("status", value)}
              disabled={isLoading}
            >
              <SelectTrigger id="status-filter">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="parsed">Parsed</SelectItem>
                <SelectItem value="executing">Executing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type-filter">Signal Type</Label>
            <Select
              value={filters.signalType}
              onValueChange={(value) => handleFilterChange("signalType", value)}
              disabled={isLoading}
            >
              <SelectTrigger id="type-filter">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="image">Image</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date-from">Date From</Label>
            <Input
              id="date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date-to">Date To</Label>
            <Input
              id="date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleApplyFilters} disabled={isLoading} className="flex-1 sm:flex-none">
            <Search className="mr-2 h-4 w-4" />
            Apply Filters
          </Button>
          {hasActiveFilters && (
            <Button
              onClick={handleResetFilters}
              variant="outline"
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              <X className="mr-2 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
