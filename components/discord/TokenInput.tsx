"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Copy } from "lucide-react";
import { toast } from "sonner";

interface TokenInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidate: (isValid: boolean) => void;
}

export function TokenInput({ value, onChange, onValidate }: TokenInputProps) {
  const [showToken, setShowToken] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<"idle" | "valid" | "invalid">("idle");

  const handleTest = async () => {
    if (!value || value.length < 50) {
      toast.error("Please enter a valid Discord token (minimum 50 characters)");
      return;
    }

    setIsValidating(true);
    setValidationStatus("idle");

    try {
      const response = await fetch("/api/discord/token/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        setValidationStatus("valid");
        onValidate(true);
        toast.success(
          `Token validated successfully! Connected as ${data.username}#${data.discriminator}`
        );
      } else {
        setValidationStatus("invalid");
        onValidate(false);
        toast.error(data.error || "Invalid Discord token");
      }
    } catch (error) {
      setValidationStatus("invalid");
      onValidate(false);
      toast.error("Failed to validate token. Please try again.");
      if (process.env.NODE_ENV === "development") {
        console.error("Token validation error:", error);
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Token copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy token");
      if (process.env.NODE_ENV === "development") {
        console.error("Copy error:", error);
      }
    }
  };

  const maskToken = (token: string) => {
    if (token.length <= 10) return "●".repeat(token.length);
    return token.slice(0, 5) + "●".repeat(token.length - 10) + token.slice(-5);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="discord-token">Discord Token</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="discord-token"
            type={showToken ? "text" : "password"}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setValidationStatus("idle");
            }}
            placeholder="Enter your Discord user token"
            className="pr-20"
            aria-label="Discord Token"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {validationStatus === "valid" && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {validationStatus === "invalid" && (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowToken(!showToken)}
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={isValidating}
            aria-label="Copy token"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          onClick={handleTest}
          disabled={!value || value.length < 50 || isValidating}
          size="sm"
        >
          {isValidating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {!showToken && value ? (
          <span className="font-mono">{maskToken(value)}</span>
        ) : (
          "Your Discord token will be encrypted and stored securely"
        )}
      </p>
      {value && value.length < 50 && (
        <p className="text-sm text-destructive">
          Token must be at least 50 characters long
        </p>
      )}
    </div>
  );
}
