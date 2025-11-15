/**
 * GET /api/admin/subscriptions
 * Get all pending subscription payment requests (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { connectDB } from "@/lib/db/connection";
import { Subscription } from "@/lib/db/models/Subscription";
import { User } from "@/lib/db/models/User";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    await connectDB();

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query
    const query: Record<string, unknown> = {};
    if (status !== "all") {
      query.status = status;
    }

    // Get subscriptions with user information
    const subscriptions = await Subscription.find(query).sort({ createdAt: -1 }).limit(limit);

    // Get user emails for each subscription
    const userIds = subscriptions.map((sub) => sub.userId);
    const users = await User.find({ _id: { $in: userIds } }).select("email");

    // Create email lookup map
    const userEmailMap = new Map(users.map((u) => [String(u._id), u.email]));

    // Enrich subscriptions with user email
    const enrichedSubscriptions = subscriptions.map((sub) => ({
      ...sub.toObject(),
      userEmail: userEmailMap.get(sub.userId) || "Unknown",
    }));

    return NextResponse.json({
      success: true,
      data: enrichedSubscriptions,
    });
  } catch (error) {
    console.error("Error fetching admin subscriptions:", error);

    const isAuthError =
      error instanceof Error &&
      (error.message === "Authentication required" || error.message === "Admin access required");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isAuthError ? "FORBIDDEN" : "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch subscriptions",
          statusCode: isAuthError ? 403 : 500,
        },
      },
      { status: isAuthError ? 403 : 500 }
    );
  }
}
