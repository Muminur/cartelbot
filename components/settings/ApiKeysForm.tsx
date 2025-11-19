"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiKeysSchema, ApiKeysFormData } from "@/lib/validation/settings";
import { toast } from "sonner";

interface ApiKeysFormProps {
  hasApiKeys: boolean;
  onSave: () => void;
}

export function ApiKeysForm({ hasApiKeys, onSave }: ApiKeysFormProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ApiKeysFormData>({
    resolver: zodResolver(apiKeysSchema),
  });

  const onSubmit = async (data: ApiKeysFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: data.apiKey,
          apiSecret: data.apiSecret,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save API keys");
      }

      toast.success("API keys saved successfully and encrypted", {
        description: "Your API keys have been securely encrypted and stored.",
      });
      reset();
      onSave();
    } catch (error) {
      toast.error("Failed to save API keys", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete your API keys? This action cannot be undone.")) {
      return;
    }

    setDeleteLoading(true);
    try {
      const response = await fetch("/api/user/settings/api-keys", {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to delete API keys");
      }

      toast.success("API keys deleted successfully");
      onSave();
    } catch (error) {
      toast.error("Failed to delete API keys", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Binance API Keys</CardTitle>
        <CardDescription>
          Configure your Binance API keys to enable automated trading
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertDescription className="text-yellow-900">
              <strong>Security Notice:</strong> Your API keys are encrypted with AES-256-GCM
              before storage. Never share your API keys with anyone.
            </AlertDescription>
          </Alert>

          {hasApiKeys && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900 ml-2">
                <strong>API Keys Configured:</strong> Your encrypted API keys are stored securely.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                placeholder={hasApiKeys ? "••••••••••••••••" : "Enter your Binance API key"}
                {...register("apiKey")}
                className={errors.apiKey ? "border-red-500" : ""}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground"
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.apiKey && (
              <p className="text-sm text-red-500">{errors.apiKey.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiSecret">API Secret</Label>
            <div className="relative">
              <Input
                id="apiSecret"
                type={showApiSecret ? "text" : "password"}
                placeholder={hasApiKeys ? "••••••••••••••••" : "Enter your Binance API secret"}
                {...register("apiSecret")}
                className={errors.apiSecret ? "border-red-500" : ""}
              />
              <button
                type="button"
                onClick={() => setShowApiSecret(!showApiSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground"
              >
                {showApiSecret ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.apiSecret && (
              <p className="text-sm text-red-500">{errors.apiSecret.message}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? "Saving..." : "Save API Keys"}
            </Button>
            {hasApiKeys && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting..." : "Delete Keys"}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
