/**
 * Discord Client Status API Endpoint
 *
 * GET /api/discord/client/status
 *
 * Returns status of Discord client(s).
 * If userId query parameter is provided, returns status for that specific client.
 * Otherwise, returns status for authenticated user's client.
 *
 * Security:
 * - Requires authentication
 * - Users can only view their own client status (unless admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDiscordClientManager } from "@/lib/discord/client-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const { user, error } = await getUserFromRequest(req);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const authenticatedUserId = String(user._id);

    // Get Discord client manager
    const manager = getDiscordClientManager();

    // Check if requesting specific user status
    const searchParams = req.nextUrl.searchParams;
    const requestedUserId = searchParams.get("userId");

    if (requestedUserId) {
      // Only allow users to view their own status (unless admin)
      if (requestedUserId !== authenticatedUserId) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 403 }
        );
      }

      const status = manager.getStatus(requestedUserId);
      if (!status) {
        return NextResponse.json(
          { success: false, error: "Client not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, status }, { status: 200 });
    } else {
      // Return authenticated user's client status
      const status = manager.getStatus(authenticatedUserId);

      if (!status) {
        return NextResponse.json(
          {
            success: true,
            status: null,
            message: "No active client for this user",
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ success: true, status }, { status: 200 });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[API] Error getting Discord client status:", error);
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
