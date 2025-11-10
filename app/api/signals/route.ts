import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Signal } from "@/lib/db/models";
import { parseSignal } from "@/lib/parser";
import { formatErrorResponse } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { rawSignal, isImageSignal = false } = body;

    if (!rawSignal || typeof rawSignal !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Raw signal text is required", statusCode: 400 },
        },
        { status: 400 }
      );
    }

    const parsed = parseSignal(rawSignal);

    if (parsed.errors.length > 0 && parsed.confidence < 50) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to parse signal",
            details: parsed.errors,
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    await connectDB();

    const signal = await Signal.create({
      userId: user._id,
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: parsed.targets,
      stopLoss: parsed.stopLoss,
      currentMarketPrice: parsed.currentMarketPrice,
      status: parsed.errors.length === 0 ? "parsed" : "pending",
      rawSignal,
      isImageSignal,
      parseErrors: parsed.errors,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          signalId: signal._id,
          parsed,
          signal: {
            id: signal._id,
            symbol: signal.symbol,
            entries: signal.entries,
            targets: signal.targets,
            stopLoss: signal.stopLoss,
            currentMarketPrice: signal.currentMarketPrice,
            status: signal.status,
            createdAt: signal.createdAt,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/signals error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");

    const query: Record<string, unknown> = { userId: user._id };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [signals, total] = await Promise.all([
      Signal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Signal.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: signals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/signals error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}
