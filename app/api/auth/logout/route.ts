import { createSuccessResponse, createErrorResponse } from "@/lib/utils/api";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  try {
    await clearSessionCookie();
    return createSuccessResponse({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return createErrorResponse(error);
  }
}
