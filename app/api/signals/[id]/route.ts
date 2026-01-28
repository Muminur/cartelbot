import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Signal } from "@/lib/db/models";
import { parseSignal } from "@/lib/parser";
import { formatErrorResponse } from "@/lib/utils/errors";
import { serializeDocument } from "@/lib/utils/serialize";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { id } = await params;
    const signal = await Signal.findOne({ _id: id, userId: user._id }).lean();

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Signal not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json({
      success: true,
      data: serializeDocument(signal),
    });
  } catch (error) {
    const { id } = await params;
    console.error(`GET /api/signals/${id} error:`, error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { id } = await params;
    const signal = await Signal.findOne({ _id: id, userId: user._id });

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Signal not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    if (signal.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Only pending signals can be edited",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { rawSignal } = body;

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
            message: "Failed to parse updated signal",
            details: parsed.errors,
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    signal.rawSignal = rawSignal;
    signal.symbol = parsed.symbol;
    signal.entries = parsed.entries;
    signal.targets = parsed.targets;
    signal.stopLoss = parsed.stopLoss;
    signal.currentMarketPrice = parsed.currentMarketPrice;
    signal.status = parsed.errors.length === 0 ? "parsed" : "pending";
    signal.parseErrors = parsed.errors;

    await signal.save();

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json({
      success: true,
      data: {
        signal: serializeDocument({
          id: signal._id,
          symbol: signal.symbol,
          entries: signal.entries,
          targets: signal.targets,
          stopLoss: signal.stopLoss,
          currentMarketPrice: signal.currentMarketPrice,
          status: signal.status,
          rawSignal: signal.rawSignal,
          parseErrors: signal.parseErrors,
          updatedAt: signal.updatedAt,
        }),
        parsed,
      },
    });
  } catch (error) {
    const { id } = await params;
    console.error(`PUT /api/signals/${id} error:`, error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { id } = await params;
    const signal = await Signal.findOne({ _id: id, userId: user._id });

    if (!signal) {
      return NextResponse.json(
        {
          success: false,
          error: { message: "Signal not found", statusCode: 404 },
        },
        { status: 404 }
      );
    }

    await Signal.deleteOne({ _id: id });

    return NextResponse.json({
      success: true,
      data: { message: "Signal deleted successfully" },
    });
  } catch (error) {
    const { id } = await params;
    console.error(`DELETE /api/signals/${id} error:`, error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}
