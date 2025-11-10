import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/", "/login", "/verify"];
const API_PUBLIC_PATHS = ["/api/auth/magic-link", "/api/auth/verify"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || API_PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

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
