"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmationDialog from "@/components/signals/ConfirmationDialog";
import { API_ROUTES } from "@/lib/constants";
import { UserProfile, ParsedSignal } from "@/types";
import { toast } from "sonner";
import { History } from "lucide-react";

export default function SignalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rawSignal, setRawSignal] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parsedSignal, setParsedSignal] = useState<ParsedSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Only JPEG, PNG, and WebP images are allowed");
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("File too large. Maximum size is 10MB");
      return;
    }

    setImageFile(file);
    setRawSignal("");
    setParsedSignal(null);
    setError(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawSignal(e.target.value);
    setImageFile(null);
    setPreviewUrl(null);
    setParsedSignal(null);
    setError(null);
  };

  const handleParseOnly = async () => {
    if (!rawSignal && !imageFile) {
      setError("Please provide a signal text or upload an image");
      return;
    }

    setSubmitting(true);
    setError(null);
    setParsedSignal(null);

    try {
      let response;

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        response = await fetch("/api/signals/parse", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/signals/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawSignal }),
        });
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || "Failed to parse signal");
        return;
      }

      // For image signals, capture the OCR text returned from parser
      if (imageFile && data.data.extractedText) {
        setRawSignal(data.data.extractedText);
        console.log("[SIGNALS] OCR text captured:", {
          length: data.data.extractedText.length,
          preview: data.data.extractedText.substring(0, 100),
        });
      }

      setParsedSignal(data.data);
      setShowConfirmDialog(true);
    } catch (err) {
      setError("An error occurred while parsing the signal");
      toast.error("Failed to parse signal");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!parsedSignal) {
      toast.error("Please parse the signal first");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        rawSignal,
        isImageSignal: !!imageFile,
      };

      console.log("[SIGNALS] Submitting signal:", {
        isImageSignal: payload.isImageSignal,
        rawSignalLength: payload.rawSignal.length,
        rawSignalPreview: payload.rawSignal.substring(0, 100),
      });

      // Step 1: Submit signal
      const response = await fetch(API_ROUTES.SIGNALS.LIST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || "Failed to submit signal");
        toast.error(data.error?.message || "Failed to submit signal");
        return;
      }

      const signalId = data.data._id;
      console.log("[SIGNALS] Signal submitted successfully, ID:", signalId);
      toast.success("Signal submitted successfully!");
      setShowConfirmDialog(false);

      // Step 2: Automatically execute trade
      console.log("[SIGNALS] Executing trade automatically...");
      const executeResponse = await fetch("/api/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId,
          investmentAmount: user?.investmentAmount || 100,
          positionSizingMethod: user?.positionSizingMethod || "fixed",
          positionSizingPercentage: user?.riskPercentage,
          testnet: user?.useTestnet || false,
          createOCO: true,
        }),
      });

      const executeData = await executeResponse.json();

      if (!executeResponse.ok || !executeData.success) {
        console.error("[SIGNALS] Trade execution failed:", executeData.error);
        toast.error(executeData.error?.message || "Trade execution failed");
        // Still redirect to history even on failure
        router.push(`/signals/history?highlight=${signalId}`);
        return;
      }

      console.log("[SIGNALS] Trade executed successfully:", executeData.data);

      if (executeData.data.requiresApproval) {
        toast.success("Signal submitted! Trade requires manual approval in dashboard.");
      } else {
        toast.success("Signal submitted and trade executed successfully!");
      }

      // Redirect to signal history with highlight
      router.push(`/signals/history?highlight=${signalId}`);
    } catch (err) {
      setError("An error occurred while processing the signal");
      toast.error("An error occurred while processing the signal");
      console.error(err);
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setRawSignal("");
    setImageFile(null);
    setPreviewUrl(null);
    setParsedSignal(null);
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
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
              <Button variant="outline" size="sm" onClick={() => router.push("/signals/history")}>
                <History className="mr-2 h-4 w-4" />
                History
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
                Dashboard
              </Button>
              <span className="text-sm text-gray-600">{user.email}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Submit Trading Signal</h1>
          <p className="text-gray-600 mt-2">Parse and submit signals from text or images</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Signal Input</CardTitle>
              <CardDescription>Enter signal text or upload an image</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text Signal
                </label>
                <textarea
                  value={rawSignal}
                  onChange={handleTextChange}
                  placeholder="Paste your trading signal here..."
                  className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  disabled={!!imageFile}
                />
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex-1 h-px bg-gray-300"></div>
                <span className="text-sm text-gray-500">OR</span>
                <div className="flex-1 h-px bg-gray-300"></div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image Upload
                </label>
                <Input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleImageChange}
                  disabled={!!rawSignal}
                />
                {previewUrl && (
                  <div className="mt-4 relative w-full" style={{ maxHeight: "16rem" }}>
                    <Image
                      src={previewUrl}
                      alt="Signal preview"
                      width={800}
                      height={600}
                      className="max-w-full h-auto max-h-64 rounded border object-contain"
                      style={{ width: "auto", height: "auto", maxHeight: "16rem" }}
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-600">{success}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  onClick={handleParseOnly}
                  disabled={submitting || (!rawSignal && !imageFile)}
                  className="flex-1"
                >
                  {submitting ? "Parsing..." : "Parse & Review"}
                </Button>
                <Button onClick={handleClear} variant="outline">
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {parsedSignal && (
            <Card>
              <CardHeader>
                <CardTitle>Parsed Signal</CardTitle>
                <CardDescription>
                  Confidence: {parsedSignal.confidence}%
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Symbol</label>
                    <p className="text-lg font-semibold">{parsedSignal.symbol || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Stop Loss</label>
                    <p className="text-lg font-semibold text-red-600">
                      {parsedSignal.stopLoss || "N/A"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Entry Prices</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {parsedSignal.entries.length > 0 ? (
                      parsedSignal.entries.map((entry, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                        >
                          {entry}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">None</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Targets</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {parsedSignal.targets.length > 0 ? (
                      parsedSignal.targets.map((target, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                        >
                          {target}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">None</span>
                    )}
                  </div>
                </div>

                {parsedSignal.currentMarketPrice && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Current Market Price</label>
                    <p className="text-lg font-semibold">{parsedSignal.currentMarketPrice}</p>
                  </div>
                )}

                {parsedSignal.errors.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Parsing Issues</label>
                    <ul className="mt-1 space-y-1">
                      {parsedSignal.errors.map((err, i) => (
                        <li key={i} className="text-sm text-red-600">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {parsedSignal && (
        <ConfirmationDialog
          isOpen={showConfirmDialog}
          onClose={() => setShowConfirmDialog(false)}
          onConfirm={handleConfirmSubmit}
          parsedSignal={parsedSignal}
          isSubmitting={submitting}
        />
      )}
    </div>
  );
}
