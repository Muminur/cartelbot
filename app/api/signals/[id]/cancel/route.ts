import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Signal } from "@/lib/db/models";
import { formatErrorResponse } from "@/lib/utils/errors";

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

    if (signal.status !== "pending" && signal.status !== "parsed") {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Only pending or parsed signals can be cancelled",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    signal.status = "cancelled";
    await signal.save();

    return NextResponse.json({
      success: true,
      data: {
        message: "Signal cancelled successfully",
        signal: {
          id: signal._id,
          status: signal.status,
          updatedAt: signal.updatedAt,
        },
      },
    });
  } catch (error) {
    const { id } = await params;
    console.error(`DELETE /api/signals/${id}/cancel error:`, error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}
