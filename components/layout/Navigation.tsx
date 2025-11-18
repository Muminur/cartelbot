"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MobileSidebar } from "./MobileSidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { API_ROUTES } from "@/lib/constants";

interface NavigationProps {
  userEmail?: string;
}

export function Navigation({ userEmail }: NavigationProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch(API_ROUTES.AUTH.LOGOUT, { method: "POST" });
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  return (
    <nav className="bg-white dark:bg-card border-b dark:border-border sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side: Hamburger + Logo */}
          <div className="flex items-center space-x-3">
            {/* Mobile menu button - only visible on mobile/tablet */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <SheetDescription className="sr-only">
                  Access dashboard navigation including signals, trades, portfolio, settings, and subscription management.
                </SheetDescription>
                <MobileSidebar onNavigate={() => setMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 dark:from-purple-600 dark:to-purple-800 rounded-full flex items-center justify-center">
              <span className="text-lg font-bold text-white">CB</span>
            </div>
            <span className="text-xl font-bold text-foreground">CartelBot</span>
          </div>

          {/* Right side: Theme Toggle + User email + Logout */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <ThemeToggle />
            {userEmail && (
              <span className="text-sm text-muted-foreground hidden sm:block">{userEmail}</span>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
