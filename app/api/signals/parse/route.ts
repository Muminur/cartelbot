import { NextRequest, NextResponse } from "next/server";
import { parseSignal, parseImageSignal } from "@/lib/parser";
import { formatErrorResponse } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const imageFile = formData.get("image") as File | null;

      if (!imageFile) {
        return NextResponse.json(
          {
            success: false,
            error: { message: "Image file is required", statusCode: 400 },
          },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const parsed = await parseImageSignal(buffer);

      return NextResponse.json({
        success: true,
        data: parsed,
      });
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

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error("POST /api/signals/parse error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}
