/**
 * GET /api/subscriptions - Get user's subscription history
 * POST /api/subscriptions - Create new subscription payment request
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { Subscription } from "@/lib/db/models/Subscription";
import { TIER_CONFIGS, calculateSubscriptionEndDate } from "@/lib/subscription";
import { env } from "@/lib/config/env";

/**
 * GET /api/subscriptions
 * Get user's subscription history
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user || error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
            statusCode: 401,
          },
        },
        { status: 401 }
      );
    }

    await connectDB();

    // Get all subscriptions for this user, sorted by most recent
    const subscriptions = await Subscription.find({ userId: String(user._id) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(); // Limit to last 50 subscriptions

    return NextResponse.json({
      success: true,
      data: subscriptions,
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch subscriptions",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subscriptions
 * Create new subscription payment request
 *
 * Body: {
 *   tier: "premium" | "pro",
 *   txHash: string (TRC20 transaction hash),
 *   fromAddress: string (TRC20 sender address)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (!user || error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
            statusCode: 401,
          },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tier, txHash, fromAddress } = body;

    // Validation
    if (!tier || !["premium", "pro"].includes(tier)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TIER",
            message: "Invalid subscription tier. Choose 'premium' or 'pro'.",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    if (!txHash || typeof txHash !== "string" || txHash.length !== 64) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TX_HASH",
            message: "Invalid transaction hash. Must be 64 characters.",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    if (!fromAddress || !/^T[a-zA-Z0-9]{33}$/.test(fromAddress)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ADDRESS",
            message: "Invalid TRC20 address format",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Check if transaction hash already exists
    const existingSubscription = await Subscription.findOne({ txHash }).lean();
    if (existingSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE_TX",
            message: "This transaction has already been submitted",
            statusCode: 409,
          },
        },
        { status: 409 }
      );
    }

    const tierConfig = TIER_CONFIGS[tier as "premium" | "pro"];
    const startDate = new Date();
    const endDate = calculateSubscriptionEndDate(startDate, 1); // 1 month

    // Create subscription record (pending approval)
    const subscription = await Subscription.create({
      userId: String(user._id),
      tier,
      amount: tierConfig.price,
      currency: "USDT",
      txHash,
      fromAddress,
      status: "pending",
      startDate,
      endDate,
      autoRenew: false,
    });

    // TODO: Send notification email to admin for payment verification
    // await sendAdminNotification({
    //   type: "new_payment",
    //   subscriptionId: subscription._id,
    //   userEmail: user.email,
    //   tier,
    //   amount: tierConfig.price,
    //   txHash,
    // });

    return NextResponse.json({
      success: true,
      data: {
        subscription,
        paymentInfo: {
          walletAddress: env.PAYMENT_WALLET_ADDRESS,
          amount: tierConfig.price,
          currency: "USDT",
          network: "TRC20",
          message: "Payment submitted successfully. Please wait for admin approval.",
        },
      },
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create subscription",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}
