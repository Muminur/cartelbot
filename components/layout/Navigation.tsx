"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { API_ROUTES } from "@/lib/constants";

interface NavigationProps {
  userEmail?: string;
}

export function Navigation({ userEmail }: NavigationProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch(API_ROUTES.AUTH.LOGOUT, { method: "POST" });
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  return (
    <nav className="bg-white border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center">
              <span className="text-lg font-bold text-white">CB</span>
            </div>
            <span className="text-xl font-bold">CartelBot</span>
          </div>
          <div className="flex items-center space-x-4">
            {userEmail && (
              <span className="text-sm text-gray-600 hidden sm:block">{userEmail}</span>
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
