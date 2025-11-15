/**
 * POST /api/admin/subscriptions/[id]/approve
 * Approve or reject a subscription payment (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAdmin } from "@/lib/auth/admin";
import { connectDB } from "@/lib/db/connection";
import { Subscription } from "@/lib/db/models/Subscription";
import { User } from "@/lib/db/models/User";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);

    const { id } = await params;
    const body = await request.json();
    const { action, reason } = body; // action: "approve" | "reject"

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ACTION",
            message: "Action must be 'approve' or 'reject'",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Find subscription
    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Subscription not found",
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Check if already processed
    if (subscription.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ALREADY_PROCESSED",
            message: `Subscription already ${subscription.status}`,
            statusCode: 409,
          },
        },
        { status: 409 }
      );
    }

    if (action === "approve") {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        subscription.status = "confirmed";
        await subscription.save({ session });

        await User.findByIdAndUpdate(
          subscription.userId,
          {
            subscriptionTier: subscription.tier,
            subscriptionExpiry: subscription.endDate,
          },
          { session }
        );

        await session.commitTransaction();

        return NextResponse.json({
          success: true,
          data: {
            subscription,
            message: "Subscription approved successfully",
          },
        });
      } catch (txError) {
        await session.abortTransaction();
        throw txError;
      } finally {
        session.endSession();
      }
    } else {
      subscription.status = "cancelled";
      await subscription.save();

      return NextResponse.json({
        success: true,
        data: {
          subscription,
          message: `Subscription rejected${reason ? `: ${reason}` : ""}`,
        },
      });
    }
  } catch (error) {
    console.error("Error processing subscription approval:", error);

    const isAuthError =
      error instanceof Error &&
      (error.message === "Authentication required" || error.message === "Admin access required");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isAuthError ? "FORBIDDEN" : "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to process subscription",
          statusCode: isAuthError ? 403 : 500,
        },
      },
      { status: isAuthError ? 403 : 500 }
    );
  }
}
