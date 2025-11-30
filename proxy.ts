import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, verifyJWT } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/", "/login", "/verify", "/admin/login"];
const API_PUBLIC_PATHS = ["/api/auth/magic-link", "/api/auth/verify"];
const ADMIN_AUTH_PATHS = ["/api/admin/auth/login", "/api/admin/auth/session", "/api/admin/auth/change-password", "/api/admin/auth/logout"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't need any authentication
  if (PUBLIC_PATHS.includes(pathname) || API_PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Admin auth endpoints - allow without token (they handle their own auth)
  if (ADMIN_AUTH_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check if this is an admin route
  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  if (isAdminRoute) {
    // For admin routes, check admin_token cookie
    const adminToken = request.cookies.get("admin_token")?.value;

    if (!adminToken) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: { message: "Admin authentication required", code: "AUTHENTICATION_ERROR" } },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      const payload = verifyJWT(adminToken);
      if (!payload || !payload.isAdmin) {
        throw new Error("Invalid admin token");
      }
      return NextResponse.next();
    } catch {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: { message: "Invalid or expired admin session", code: "AUTHENTICATION_ERROR" } },
          { status: 401 }
        );
      }
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete("admin_token");
      return response;
    }
  }

  // For regular user routes, check session cookie
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: { message: "Authentication required", code: "AUTHENTICATION_ERROR" } },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    verifySessionToken(sessionCookie);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid or expired session", code: "AUTHENTICATION_ERROR" } },
        { status: 401 }
      );
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
