import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin-auth";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/db/models";
import { escapeRegex, validatePagination, isValidObjectId } from "@/lib/utils/validation";
import { serializeDocuments, serializeDocument } from "@/lib/utils/serialize";

interface UserQuery {
  email?: { $regex: string; $options: string };
  subscriptionTier?: string;
  isActive?: boolean;
}

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const rawPage = parseInt(searchParams.get("page") || "1");
    const rawLimit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const tier = searchParams.get("tier") || "all";
    const status = searchParams.get("status") || "all";

    // Validate pagination parameters
    const { page, limit } = validatePagination(rawPage, rawLimit);

    // Build query with sanitized inputs
    const query: UserQuery = {};

    if (search) {
      query.email = { $regex: escapeRegex(search), $options: "i" };
    }

    if (tier !== "all") {
      query.subscriptionTier = tier;
    }

    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-encryptedApiKey -encryptedApiSecret")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in admin UI)
    return NextResponse.json({
      success: true,
      data: serializeDocuments(users),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", {
      error: error instanceof Error ? error.message : String(error),
      adminId: adminCheck.user?._id,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "USERS_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to fetch users",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}

interface AllowedUpdates {
  isActive?: boolean;
  subscriptionTier?: "free" | "premium" | "pro";
  subscriptionExpiry?: Date;
}

// Update user endpoint (for suspension, tier changes, etc.)
export async function PATCH(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    await connectDB();

    const body = await request.json();
    const { userId, updates } = body;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_ID_REQUIRED",
            message: "User ID is required",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Validate ObjectId format
    if (!isValidObjectId(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_USER_ID",
            message: "Invalid user ID format",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Only allow certain fields to be updated
    const allowedUpdates: AllowedUpdates = {};
    if (updates.isActive !== undefined) allowedUpdates.isActive = updates.isActive;
    if (updates.subscriptionTier) allowedUpdates.subscriptionTier = updates.subscriptionTier;
    if (updates.subscriptionExpiry) allowedUpdates.subscriptionExpiry = new Date(updates.subscriptionExpiry);

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true }
    ).select("-encryptedApiKey -encryptedApiSecret");

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in admin UI)
    return NextResponse.json({
      success: true,
      data: serializeDocument(user),
    });
  } catch (error) {
    console.error("Error updating user:", {
      error: error instanceof Error ? error.message : String(error),
      adminId: adminCheck.user?._id,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "USER_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update user",
          statusCode: 500,
        },
      },
      { status: 500 }
    );
  }
}
