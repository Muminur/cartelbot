import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Trade } from "@/lib/db/models/Trade";
import { Signal } from "@/lib/db/models/Signal";
import { Types } from "mongoose";
import { ValidationError } from "@/lib/utils/errors";

/**
 * DELETE /api/trades/cleanup-pending
 *
 * Deletes all pending approval trades (user's own) that were never executed.
 * Also updates associated signals back to "parsed" status using MongoDB transactions.
 *
 * This is useful for cleaning up old trades created when requireApproval was enabled.
 *
 * Security: User can only delete their own pending trades (not admin operation).
 * Rate limit: Max 5 calls per hour to prevent abuse.
 */
export async function DELETE(request: NextRequest) {
  const session = await connectDB().then(() => Trade.db.startSession());

  try {
    const authResult = await getUserFromRequest(request);
    if (!authResult || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = authResult.user;

    // Validate user ID format
    if (!Types.ObjectId.isValid(String(user._id))) {
      throw new ValidationError("Invalid user ID format");
    }

    const userId = new Types.ObjectId(String(user._id));

    // Start transaction for atomic operation
    session.startTransaction();

    // Find all pending approval trades for this user (lean + select for performance)
    const pendingTrades = await Trade.find({
      userId: String(userId),
      status: "pending_approval",
      "buyOrder.orderId": 0, // Fake order ID (not executed)
    })
      .lean()
      .select("_id signalId symbol createdAt")
      .session(session);

    if (pendingTrades.length === 0) {
      await session.abortTransaction();
      return NextResponse.json({
        success: true,
        message: "No pending approval trades found",
        deleted: 0,
        updatedSignals: 0,
      });
    }

    // Get signal IDs with proper type safety
    const signalIds = pendingTrades
      .map(t => t.signalId)
      .filter((id): id is NonNullable<typeof id> => id !== null && id !== undefined);

    // Audit log before deletion
    console.log("[Audit] Cleanup Pending Trades - BEFORE DELETE:", {
      userId: String(userId),
      timestamp: new Date().toISOString(),
      count: pendingTrades.length,
      trades: pendingTrades.map(t => ({
        tradeId: String(t._id),
        signalId: t.signalId ? String(t.signalId) : null,
        symbol: t.symbol,
        createdAt: t.createdAt,
      })),
    });

    // Delete pending trades (within transaction)
    const deleteResult = await Trade.deleteMany(
      {
        userId: String(userId),
        status: "pending_approval",
        "buyOrder.orderId": 0,
      },
      { session }
    );

    // Update signals back to "parsed" status (within transaction)
    const updateResult = await Signal.updateMany(
      { _id: { $in: signalIds } },
      { $set: { status: "parsed" } },
      { session }
    );

    // Commit transaction
    await session.commitTransaction();

    console.log("[Cleanup Pending Trades] Successfully deleted pending approval trades:", {
      userId: String(userId),
      deletedCount: deleteResult.deletedCount,
      updatedSignals: updateResult.modifiedCount,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleteResult.deletedCount} pending approval trades`,
      deleted: deleteResult.deletedCount,
      updatedSignals: updateResult.modifiedCount,
      details: {
        tradeIds: pendingTrades.map(t => String(t._id)),
        signalIds: signalIds.map(id => String(id)),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();

    console.error("[Cleanup Pending Trades] Error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Specific error handling
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.name === "MongoNetworkError") {
      return NextResponse.json(
        { success: false, error: "Database connection failed - please retry" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cleanup pending trades",
      },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
}
