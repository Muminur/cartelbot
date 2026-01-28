import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createSuccessResponse, createErrorResponse } from "@/lib/utils/api";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/db/models";
import { serializeDocuments } from "@/lib/utils/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users-with-keys
 * Returns list of users who have Binance API keys configured
 * Admin only endpoint for order cleanup feature
 */
export async function GET(request: NextRequest) {
  try {
    // Admin authentication
    await requireAdmin(request);

    await connectDB();

    // Find users with API keys configured
    const users = await User.find({
      encryptedApiKey: { $exists: true, $nin: [null, ""] },
      encryptedApiSecret: { $exists: true, $nin: [null, ""] },
    })
      .select("_id email useTestnet createdAt")
      .sort({ email: 1 })
      .limit(1000) // Admin endpoint - reasonable limit for users with API keys
      .lean();

    return createSuccessResponse({
      users: serializeDocuments(users),
      total: users.length,
    });
  } catch (error) {
    console.error("[Admin Users With Keys] Error:", {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    return createErrorResponse(error);
  }
}
