"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { API_ROUTES } from "@/lib/constants";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  /**
   * Fix 4: Network Error Categorization
   * Categorizes errors by type and provides specific guidance to help users resolve issues.
   * Handles: network failures, JSON parse errors, server errors, and API errors.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(API_ROUTES.AUTH.MAGIC_LINK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Server returned non-JSON response:", {
          status: response.status,
          contentType,
          url: response.url,
        });
        throw new Error(
          "Server returned an unexpected response format. Please contact support if this persists."
        );
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to send magic link");
      }

      setSent(true);
    } catch (error) {
      // Categorize errors and provide specific user guidance
      let errorMessage = "An unexpected error occurred";

      // Network connectivity issues (DNS, connection refused, timeout)
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Unable to connect to server. Please check your internet connection and try again.";
        console.error("Network error:", error);
      }
      // JSON parse errors (server sent invalid JSON)
      else if (error instanceof SyntaxError) {
        errorMessage = "Server returned an invalid response. Please refresh the page and try again.";
        console.error("JSON parse error:", error);
      }
      // API errors with specific messages
      else if (error instanceof Error) {
        errorMessage = error.message;
        console.error("API error:", error);
      }
      // Unknown error types
      else {
        errorMessage = "Something went wrong. Please try again or contact support.";
        console.error("Unknown error:", error);
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4 transition-colors">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Check your email</CardTitle>
            <CardDescription className="text-center">
              We sent a magic link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-900 dark:text-blue-400">
              Click the link in the email to sign in. The link will expire in 15 minutes.
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4 transition-colors">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-foreground">CB</span>
            </div>
          </div>
          <CardTitle className="text-center">Welcome to CartelBot</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account with magic link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-900 dark:text-red-400">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send magic link"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>No password required. We&apos;ll send you a secure link to sign in.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
