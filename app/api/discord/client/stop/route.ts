/**
 * Stop Discord Client API Endpoint
 *
 * POST /api/discord/client/stop
 *
 * Stops a running Discord self-bot client for a user.
 *
 * Security:
 * - Requires authentication
 * - Users can only stop their own clients
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDiscordClientManager } from "@/lib/discord/client-manager";
import type { StopClientRequest } from "@/lib/discord/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { user, error } = await getUserFromRequest(req);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = String(user._id);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[API] Received stop client request for user ${userId}`);
    }

    // Get Discord client manager
    const manager = getDiscordClientManager();

    // Stop Discord client
    const result = await manager.stopClient(userId);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[API] Error stopping Discord client:", error);
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
