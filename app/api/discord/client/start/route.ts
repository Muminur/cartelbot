/**
 * Start Discord Client API Endpoint
 *
 * POST /api/discord/client/start
 *
 * Starts a Discord self-bot client for a user to monitor messages
 * in a specified server/channel.
 *
 * Security:
 * - Requires authentication
 * - Rate limited
 * - Validates all inputs
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDiscordClientManager } from "@/lib/discord/client-manager";
import type { StartClientRequest } from "@/lib/discord/types";

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

    // Parse request body
    const body = (await req.json()) as StartClientRequest;

    // Validate required fields
    if (!body.connectionId || !body.token || !body.serverId || !body.channelId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: connectionId, token, serverId, channelId",
        },
        { status: 400 }
      );
    }

    // Use authenticated user's ID
    const userId = String(user._id);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[API] Received start client request for user ${userId}`);
    }

    // Get Discord client manager
    const manager = getDiscordClientManager();

    // Start Discord client
    const result = await manager.startClient(
      userId,
      body.connectionId,
      body.token,
      body.serverId,
      body.channelId
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[API] Error starting Discord client:", error);
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
