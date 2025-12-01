"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SessionProvider } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <SessionProvider>
        <ErrorBoundary>{children}</ErrorBoundary>
      </SessionProvider>
    </ThemeProvider>
  );
}
