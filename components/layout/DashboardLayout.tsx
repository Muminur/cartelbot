"use client";

import { ReactNode } from "react";
import { Navigation } from "./Navigation";
import { Sidebar } from "./Sidebar";

interface DashboardLayoutProps {
  children: ReactNode;
  userEmail?: string;
  showSidebar?: boolean;
}

export function DashboardLayout({
  children,
  userEmail,
  showSidebar = true,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-background dark:to-secondary transition-colors">
      <Navigation userEmail={userEmail} />
      <div className="flex">
        {showSidebar && <Sidebar className="hidden lg:block" />}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
