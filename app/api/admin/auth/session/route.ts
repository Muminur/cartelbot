import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/lib/auth/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = verifyJWT(token);

    if (!payload || payload.role !== "admin" || !payload.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Invalid admin session" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          username: payload.username,
          role: "admin",
          isAdmin: true,
        },
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Admin session check failed:", error);
    }

    return NextResponse.json(
      { success: false, error: "Session verification failed" },
      { status: 401 }
    );
  }
}
