import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { z } from "zod";

const updateSettingsSchema = z.object({
  maxPositionSize: z.number().min(10).max(100000).optional(),
  maxDailyLoss: z.number().min(0).max(50000).optional(),
  maxOpenPositions: z.number().min(1).max(50).optional(),
  requireApproval: z.boolean().optional(),
  emergencyStop: z.boolean().optional(),
  useTestnet: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const userDoc = await User.findOne({ email: user.email });
    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        maxPositionSize: userDoc.maxPositionSize,
        maxDailyLoss: userDoc.maxDailyLoss,
        maxOpenPositions: userDoc.maxOpenPositions,
        requireApproval: userDoc.requireApproval,
        emergencyStop: userDoc.emergencyStop,
        useTestnet: userDoc.useTestnet || false,
      },
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = updateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    await connectDB();

    const updatedUser = await User.findOneAndUpdate(
      { email: user.email },
      { $set: validation.data },
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        maxPositionSize: updatedUser.maxPositionSize,
        maxDailyLoss: updatedUser.maxDailyLoss,
        maxOpenPositions: updatedUser.maxOpenPositions,
        requireApproval: updatedUser.requireApproval,
        emergencyStop: updatedUser.emergencyStop,
        useTestnet: updatedUser.useTestnet || false,
      },
    });
  } catch (error) {
    console.error("Error updating user settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
