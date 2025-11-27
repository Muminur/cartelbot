import { NextRequest, NextResponse } from "next/server";
import { parseSignal, parseImageSignal } from "@/lib/parser";
import { formatErrorResponse } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (process.env.NODE_ENV !== 'production') console.log("[API] Parse request received, content-type:", contentType);

    if (contentType.includes("multipart/form-data")) {
      if (process.env.NODE_ENV !== 'production') console.log("[API] Processing image upload...");
      const formData = await request.formData();
      const imageFile = formData.get("image") as File | null;

      if (!imageFile) {
        console.error("[API] No image file found in form data");
        return NextResponse.json(
          {
            success: false,
            error: { message: "Image file is required", statusCode: 400 },
          },
          { status: 400 }
        );
      }

      if (process.env.NODE_ENV !== 'production') console.log("[API] Image file received:", {
        name: imageFile.name,
        type: imageFile.type,
        size: imageFile.size,
      });

      if (process.env.NODE_ENV !== 'production') console.log("[API] Converting image to buffer...");
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      if (process.env.NODE_ENV !== 'production') console.log("[API] Buffer created, size:", buffer.length);

      if (process.env.NODE_ENV !== 'production') console.log("[API] Calling parseImageSignal...");
      const parsed = await parseImageSignal(buffer);

      if (process.env.NODE_ENV !== 'production') console.log("[API] Image signal parsed successfully:", {
        symbol: parsed.symbol,
        confidence: parsed.confidence,
        hasErrors: parsed.errors.length > 0,
      });

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
