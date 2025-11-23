import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Signal } from "@/lib/db/models";
import { parseSignal } from "@/lib/parser";
import { formatErrorResponse } from "@/lib/utils/errors";
import { BinanceClient } from "@/lib/binance";
import { checkSignalLimit } from "@/lib/middleware/usage-limiter";
import { serializeDocument, serializeDocuments, serializeResponse } from "@/lib/utils/serialize";
import { limitSignalTargets } from "@/lib/parser/target-limiter";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();

    const { rawSignal, isImageSignal = false } = body;

    console.log("POST /api/signals - Request received:", {
      userId: user._id,
      isImageSignal,
      rawSignalLength: rawSignal?.length,
    });

    // Check subscription usage limits
    const limitError = await checkSignalLimit(String(user._id));
    if (limitError) {
      return limitError; // Return 403 error if limit exceeded
    }

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

    console.log("POST /api/signals - Parsed signal:", {
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: parsed.targets,
      stopLoss: parsed.stopLoss,
      confidence: parsed.confidence,
      errors: parsed.errors,
    });

    // Validate parsed signal has all required fields
    const validationErrors: string[] = [];

    if (!parsed.symbol || !/^[A-Z]{3,10}USDT$/.test(parsed.symbol)) {
      validationErrors.push("Invalid or missing symbol");
    }

    if (!parsed.entries || parsed.entries.length === 0 || parsed.entries.some((e) => e <= 0)) {
      validationErrors.push("Invalid or missing entry prices");
    }

    if (!parsed.targets || parsed.targets.length === 0 || parsed.targets.some((t) => t <= 0)) {
      validationErrors.push("Invalid or missing target prices");
    }

    if (!parsed.stopLoss || parsed.stopLoss <= 0) {
      validationErrors.push("Invalid or missing stop loss");
    }

    if (validationErrors.length > 0 || (parsed.errors.length > 0 && parsed.confidence < 50)) {
      console.error("POST /api/signals - Validation failed:", {
        confidence: parsed.confidence,
        parsingErrors: parsed.errors,
        validationErrors,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Failed to parse signal - missing required fields",
            details: [...parsed.errors, ...validationErrors],
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Fetch current market price from Binance mainnet (always mainnet for accurate prices)
    let currentMarketPrice = parsed.currentMarketPrice; // Use CMP from signal if available

    if (!currentMarketPrice && parsed.symbol) {
      try {
        console.log(`[Signal Creation] Fetching current market price for ${parsed.symbol} from mainnet...`);
        const mainnetClient = new BinanceClient({
          apiKey: "", // Public endpoint - no auth needed
          apiSecret: "",
          testnet: false, // ALWAYS use mainnet for price fetching
        });

        // Add 5-second timeout to prevent slow mainnet from blocking signal creation
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Price fetch timeout after 5 seconds")), 5000)
        );

        const ticker = await Promise.race([
          mainnetClient.get24hrTicker(parsed.symbol),
          timeoutPromise,
        ]);
        currentMarketPrice = parseFloat(ticker.lastPrice);

        console.log(`[Signal Creation] Current market price for ${parsed.symbol}: ${currentMarketPrice}`);
      } catch (priceError) {
        console.warn(
          `[Signal Creation] Failed to fetch current price for ${parsed.symbol}:`,
          priceError instanceof Error ? priceError.message : "Unknown error"
        );
        // Don't fail the entire signal creation if price fetch fails
        // The price will be fetched again during trade execution
      }
    }

    await connectDB();

    // CRITICAL: Limit targets based on user's maxTargets setting
    const originalTargets = parsed.targets;
    const limitedTargets = await limitSignalTargets(originalTargets, String(user._id));

    if (limitedTargets.length < originalTargets.length) {
      console.log(
        `[Signal Creation] Limited targets from ${originalTargets.length} to ${limitedTargets.length} ` +
        `based on user's maxTargets setting. Original: [${originalTargets.map(t => t.toFixed(8)).join(", ")}], ` +
        `Limited: [${limitedTargets.map(t => t.toFixed(8)).join(", ")}]`
      );
    }

    console.log("POST /api/signals - Creating signal document:", {
      userId: user._id,
      symbol: parsed.symbol,
      entries: parsed.entries,
      originalTargets: originalTargets.length,
      limitedTargets: limitedTargets.length,
      targets: limitedTargets,
      stopLoss: parsed.stopLoss,
      currentMarketPrice: currentMarketPrice,
      status: parsed.errors.length === 0 ? "parsed" : "pending",
      isImageSignal,
    });

    const signal = await Signal.create({
      userId: user._id,
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: limitedTargets, // Use limited targets instead of all parsed targets
      stopLoss: parsed.stopLoss,
      currentMarketPrice: currentMarketPrice,
      status: parsed.errors.length === 0 ? "parsed" : "pending",
      rawSignal,
      isImageSignal,
      parseErrors: parsed.errors,
    });

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json(
      {
        success: true,
        data: {
          signalId: String(signal._id),
          parsed,
          signal: serializeDocument({
            id: signal._id,
            symbol: signal.symbol,
            entries: signal.entries,
            targets: signal.targets,
            stopLoss: signal.stopLoss,
            currentMarketPrice: signal.currentMarketPrice,
            status: signal.status,
            createdAt: signal.createdAt,
          }),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/signals error:", error);

    // Enhanced logging for MongoDB validation errors
    if (error && typeof error === "object" && "name" in error) {
      if (error.name === "ValidationError") {
        console.error("MongoDB Validation Error Details:", {
          name: error.name,
          message: (error as Error).message,
          errors: "errors" in error ? error.errors : undefined,
        });
      }
    }

    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      serializeResponse({ success: false, ...errorResponse }),
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
    const symbol = searchParams.get("symbol");
    const isImageSignal = searchParams.get("isImageSignal");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const query: Record<string, unknown> = { userId: user._id };

    // Handle comma-separated status values (e.g., "pending,executing")
    if (status) {
      const VALID_STATUSES = ["pending", "executing", "completed", "failed"] as const;
      const statusValues = status
        .split(",")
        .map((s) => s.trim())
        .filter((s) => VALID_STATUSES.includes(s as any));

      if (statusValues.length === 0) {
        // Invalid status provided, return empty results
        query.status = "invalid_status_value"; // Will match nothing
      } else if (statusValues.length === 1) {
        query.status = statusValues[0]; // Single status
      } else {
        query.status = { $in: statusValues }; // Multiple statuses - use MongoDB $in operator
      }
    }

    if (symbol) {
      query.symbol = { $regex: symbol, $options: "i" };
    }

    if (isImageSignal !== null && isImageSignal !== undefined) {
      query.isImageSignal = isImageSignal === "true";
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) {
        dateFilter.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = endDate;
      }
      query.createdAt = dateFilter;
    }

    const skip = (page - 1) * limit;

    const [signals, total] = await Promise.all([
      Signal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Signal.countDocuments(query),
    ]);

    // Serialize MongoDB ObjectIds to strings (prevents [object Object] in URLs)
    return NextResponse.json({
      success: true,
      data: serializeDocuments(signals),
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
      serializeResponse({ success: false, ...errorResponse }),
      { status: errorResponse.error.statusCode }
    );
  }
}
