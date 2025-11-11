"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ISignal, ParsedSignal } from "@/types";
import { formatPrice } from "@/lib/utils/format";
import { RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";

interface EditSignalModalProps {
  signal: ISignal | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (signalId: string, updatedSignal: string) => Promise<void>;
}

export default function EditSignalModal({
  signal,
  isOpen,
  onClose,
  onSave,
}: EditSignalModalProps) {
  const [editedText, setEditedText] = useState("");
  const [parsedData, setParsedData] = useState<ParsedSignal | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signal) {
      setEditedText(signal.rawSignal);
      setParsedData(null);
      setError(null);
    }
  }, [signal]);

  if (!signal) return null;

  const handleReparse = async () => {
    if (!editedText.trim()) {
      setError("Signal text cannot be empty");
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const response = await fetch("/api/signals/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawSignal: editedText }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || "Failed to parse signal");
        setParsedData(null);
        return;
      }

      setParsedData(data.data);
    } catch (err) {
      setError("An error occurred while parsing the signal");
      console.error(err);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!editedText.trim()) {
      setError("Signal text cannot be empty");
      return;
    }

    if (!parsedData) {
      setError("Please re-parse the signal before saving");
      return;
    }

    if (parsedData.confidence < 50) {
      setError("Parsed signal has low confidence. Please check the signal text.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(String(signal._id), editedText);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save signal");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = editedText !== signal.rawSignal;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Signal</DialogTitle>
          <DialogDescription>
            Modify the signal text and re-parse to update the extracted data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signal-text">Signal Text</Label>
            <textarea
              id="signal-text"
              value={editedText}
              onChange={(e) => {
                setEditedText(e.target.value);
                setParsedData(null);
              }}
              className="w-full h-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              placeholder="Edit your trading signal here..."
              disabled={isParsing || isSaving}
            />
          </div>

          <Button
            onClick={handleReparse}
            disabled={!hasChanges || isParsing || isSaving}
            variant="outline"
            className="w-full"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isParsing ? "animate-spin" : ""}`} />
            {isParsing ? "Parsing..." : "Re-parse Signal"}
          </Button>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            </div>
          )}

          {parsedData && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Updated Parsed Data</span>
                  <Badge
                    variant={parsedData.confidence < 80 ? "destructive" : "default"}
                    className={parsedData.confidence < 80 ? "bg-yellow-500" : "bg-green-500"}
                  >
                    Confidence: {parsedData.confidence}%
                  </Badge>
                </div>

                {parsedData.confidence < 80 && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Low Confidence</p>
                      <p className="text-xs text-yellow-700">
                        Please verify the extracted data is correct before saving.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500">Symbol</Label>
                    <p className="font-semibold">{parsedData.symbol || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Stop Loss</Label>
                    <p className="font-semibold text-red-600">
                      {parsedData.stopLoss ? formatPrice(parsedData.stopLoss) : "N/A"}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Entry Prices</Label>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.entries.length > 0 ? (
                      parsedData.entries.map((entry, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="bg-blue-50 text-blue-700 border-blue-200"
                        >
                          {formatPrice(entry)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">None</span>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Target Prices</Label>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.targets.length > 0 ? (
                      parsedData.targets.map((target, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200"
                        >
                          {formatPrice(target)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">None</span>
                    )}
                  </div>
                </div>

                {parsedData.errors.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-red-600">Parsing Issues</Label>
                    <ul className="space-y-1">
                      {parsedData.errors.map((err, i) => (
                        <li key={i} className="text-xs text-red-600 flex items-start gap-2">
                          <span className="text-red-400">•</span>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsedData.confidence >= 80 && parsedData.errors.length === 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Signal parsed successfully!</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isParsing || isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!parsedData || isParsing || isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
