import type { Metadata } from "next";
import "@/styles/globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SessionProvider } from "@/contexts/SessionContext";

export const metadata: Metadata = {
  title: "CartelBot - Automated Binance Trading Bot",
  description: "Execute trading signals automatically on Binance Spot market",
};

// Force dynamic rendering to prevent Next.js 16 Turbopack prerendering bug
export const dynamic = "force-dynamic";
export const dynamicParams = true;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
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
      </body>
    </html>
  );
}
