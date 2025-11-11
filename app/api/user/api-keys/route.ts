import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { connectDB } from "@/lib/db/connection";
import { User } from "@/lib/db/models/User";
import { encrypt, decrypt } from "@/lib/encryption";
import { z } from "zod";

const apiKeysSchema = z.object({
  apiKey: z.string().min(64, "API key must be at least 64 characters"),
  apiSecret: z.string().min(64, "API secret must be at least 64 characters"),
  isTestnet: z.boolean().optional().default(false),
});

/**
 * GET /api/user/api-keys
 * Returns whether user has API keys configured (does not return the keys)
 */
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

    const userDoc = await User.findOne({ email: user.email }).select(
      "+encryptedApiKey +encryptedApiSecret"
    );

    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const hasApiKeys = !!(userDoc.encryptedApiKey && userDoc.encryptedApiSecret);

    return NextResponse.json({
      success: true,
      data: {
        hasApiKeys,
        // For security, we only return masked version of the API key (first 8 chars)
        apiKeyPreview: hasApiKeys && userDoc.encryptedApiKey
          ? `${decrypt(userDoc.encryptedApiKey).substring(0, 8)}...`
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching API keys status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch API keys status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/api-keys
 * Saves encrypted API keys for the user
 */
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
    const validation = apiKeysSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.errors[0].message,
        },
        { status: 400 }
      );
    }

    const { apiKey, apiSecret } = validation.data;

    // Encrypt the API keys before storing
    const encryptedApiKey = encrypt(apiKey);
    const encryptedApiSecret = encrypt(apiSecret);

    await connectDB();

    const updatedUser = await User.findOneAndUpdate(
      { email: user.email },
      {
        $set: {
          encryptedApiKey,
          encryptedApiSecret,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    console.log(`API keys saved for user ${user.email}`, {
      timestamp: new Date().toISOString(),
      hasApiKey: !!encryptedApiKey,
      hasApiSecret: !!encryptedApiSecret,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "API keys saved successfully",
        hasApiKeys: true,
      },
    });
  } catch (error) {
    console.error("Error saving API keys:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save API keys" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/api-keys
 * Removes API keys from the user account
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, error } = await getUserFromRequest(request);
    if (error || !user) {
      return NextResponse.json(
        { success: false, error: error || "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const updatedUser = await User.findOneAndUpdate(
      { email: user.email },
      {
        $unset: {
          encryptedApiKey: "",
          encryptedApiSecret: "",
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    console.log(`API keys removed for user ${user.email}`, {
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        message: "API keys removed successfully",
        hasApiKeys: false,
      },
    });
  } catch (error) {
    console.error("Error removing API keys:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove API keys" },
      { status: 500 }
    );
  }
}
