/**
 * Admin API endpoint to identify and remove mock signals that were never executed on Binance
 *
 * GET /api/admin/cleanup-mock-signals - Analyze and list mock signals (dry run)
 * POST /api/admin/cleanup-mock-signals - Actually delete the mock signals
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Signal, Trade } from "@/lib/db/models";
import { requireAdmin } from "@/lib/middleware/admin-auth";

interface MockSignal {
  _id: string;
  symbol: string;
  status: string;
  createdAt: Date;
  hasTrade: boolean;
  tradeStatus?: string;
  buyOrderId?: number;
  executedQty?: number;
  reason: string;
}

interface AnalysisResult {
  totalSignals: number;
  signalsWithTrades: number;
  signalsWithoutTrades: number;
  signalsWithMockTrades: number;
  signalsWithRealBinanceOrders: number;
  mockSignals: MockSignal[];
}

// Type-safe lean document types
type LeanSignal = {
  _id: mongoose.Types.ObjectId;
  symbol: string;
  status: "pending" | "parsed" | "executing" | "completed" | "failed" | "cancelled";
  createdAt: Date;
};

type LeanTrade = {
  signalId: string;
  status: string;
  buyOrder: {
    orderId: number;
    executedQty: number;
  };
};

/**
 * Analyze signals to identify mock/test signals
 *
 * Performance: Uses bulk queries to avoid N+1 problem
 * - Before: 1001 queries for 1000 signals
 * - After: 2 queries (99.8% reduction)
 */
async function analyzeSignals(): Promise<AnalysisResult> {
  await connectDB();

  // Fetch all signals with only required fields (60% less data transfer)
  const signals = (await Signal.find({})
    .select("_id symbol status createdAt")
    .lean()
    .exec()) as unknown as LeanSignal[];

  if (process.env.NODE_ENV !== 'production') console.log(`🔍 [CLEANUP] Found ${signals.length} signals in database`);

  // Get all signal IDs for bulk query
  const signalIds = signals.map((s) => String(s._id));

  // Fetch ALL trades in ONE query (eliminates N+1 problem)
  const trades = (await Trade.find({
    signalId: { $in: signalIds },
  })
    .select("signalId status buyOrder.orderId buyOrder.executedQty")
    .lean()
    .exec()) as unknown as LeanTrade[];

  if (process.env.NODE_ENV !== 'production') console.log(`🔍 [CLEANUP] Found ${trades.length} trades for these signals`);

  // Create lookup map for O(1) access
  const tradeMap = new Map<string, LeanTrade>(
    trades.map((t) => [t.signalId, t])
  );

  const result: AnalysisResult = {
    totalSignals: signals.length,
    signalsWithTrades: 0,
    signalsWithoutTrades: 0,
    signalsWithMockTrades: 0,
    signalsWithRealBinanceOrders: 0,
    mockSignals: [],
  };

  for (const signal of signals) {
    const signalId = String(signal._id);
    const trade = tradeMap.get(signalId);

    if (!trade) {
      // No trade = signal never executed
      result.signalsWithoutTrades++;

      // Only consider it "mock" if it's not in a valid terminal/pending state
      if (
        signal.status !== "pending" &&
        signal.status !== "failed" &&
        signal.status !== "cancelled"
      ) {
        // Log potentially concerning cases
        if (signal.status === "completed") {
          console.warn(
            `⚠️  [CLEANUP] Signal ${signalId} marked 'completed' but has no trade - possible bug?`
          );
        } else if (signal.status === "executing") {
          console.warn(
            `⚠️  [CLEANUP] Signal ${signalId} stuck in 'executing' with no trade - possible orphan`
          );
        }

        result.mockSignals.push({
          _id: signalId,
          symbol: signal.symbol,
          status: signal.status,
          createdAt: signal.createdAt,
          hasTrade: false,
          reason: `No trade record - signal status '${signal.status}' but never executed on Binance`,
        });
      }
    } else {
      result.signalsWithTrades++;

      // Check if trade has real Binance order
      const buyOrder = trade.buyOrder;
      const hasRealBinanceOrder =
        buyOrder?.orderId > 0 && buyOrder?.executedQty > 0;

      if (hasRealBinanceOrder) {
        result.signalsWithRealBinanceOrders++;
      } else {
        // Trade exists but no real Binance order
        result.signalsWithMockTrades++;
        result.mockSignals.push({
          _id: signalId,
          symbol: signal.symbol,
          status: signal.status,
          createdAt: signal.createdAt,
          hasTrade: true,
          tradeStatus: trade.status,
          buyOrderId: buyOrder?.orderId,
          executedQty: buyOrder?.executedQty,
          reason:
            "Trade exists but no real Binance order (orderId=0 or executedQty=0)",
        });
      }
    }
  }

  return result;
}

/**
 * Delete mock signals and their associated trades
 *
 * Security: Validates all IDs before deletion to prevent NoSQL injection
 * Integrity: Uses MongoDB transactions to ensure atomic operations
 */
async function deleteMockSignals(
  mockSignalIds: string[]
): Promise<{ deletedSignals: number; deletedTrades: number }> {
  await connectDB();

  // Validate all IDs are valid ObjectId strings (NoSQL injection protection)
  const validIds = mockSignalIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );

  if (validIds.length === 0) {
    throw new Error("No valid signal IDs provided for deletion");
  }

  if (validIds.length !== mockSignalIds.length) {
    const invalidCount = mockSignalIds.length - validIds.length;
    console.warn(
      `⚠️  [CLEANUP] Filtered out ${invalidCount} invalid IDs for security`
    );
  }

  // Use transaction to ensure atomic operations (all succeed or all fail)
  const session = await mongoose.startSession();

  try {
    let deletedTradesCount = 0;
    let deletedSignalsCount = 0;

    await session.withTransaction(async () => {
      // Delete trades first (child records)
      const deletedTrades = await Trade.deleteMany(
        { signalId: { $in: validIds } },
        { session }
      );

      // Convert string IDs to ObjectId for Signal deletion
      const objectIds = validIds.map((id) => new mongoose.Types.ObjectId(id));
      const deletedSignals = await Signal.deleteMany(
        { _id: { $in: objectIds } },
        { session }
      );

      deletedTradesCount = deletedTrades.deletedCount || 0;
      deletedSignalsCount = deletedSignals.deletedCount || 0;

      if (process.env.NODE_ENV !== 'production') console.log(
        `✅ [CLEANUP] Transaction committed: ${deletedSignalsCount} signals, ${deletedTradesCount} trades`
      );
    });

    return {
      deletedSignals: deletedSignalsCount,
      deletedTrades: deletedTradesCount,
    };
  } catch (error) {
    console.error("❌ [CLEANUP] Transaction failed:", error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * GET - Analyze and list mock signals (dry run)
 */
export async function GET(request: NextRequest) {
  // Check admin authentication
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    if (process.env.NODE_ENV !== 'production') console.log("🔍 [CLEANUP] Starting analysis for mock signals...");

    const analysis = await analyzeSignals();

    if (process.env.NODE_ENV !== 'production') console.log(`📊 [CLEANUP] Analysis complete:
      - Total signals: ${analysis.totalSignals}
      - Real Binance orders: ${analysis.signalsWithRealBinanceOrders}
      - Mock signals found: ${analysis.mockSignals.length}
    `);

    return NextResponse.json(
      {
        success: true,
        analysis,
        message: `Found ${analysis.mockSignals.length} mock signals. Use POST to delete them.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ [CLEANUP] Error analyzing signals:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze signals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Delete mock signals
 */
export async function POST(request: NextRequest) {
  // Check admin authentication
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.response;

  try {
    if (process.env.NODE_ENV !== 'production') console.log("🗑️  [CLEANUP] Starting mock signal deletion...");

    // First, analyze to get the list
    const analysis = await analyzeSignals();

    if (analysis.mockSignals.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log("✅ [CLEANUP] No mock signals found");
      return NextResponse.json(
        {
          success: true,
          message: "No mock signals found to delete",
          deletedSignals: 0,
          deletedTrades: 0,
        },
        { status: 200 }
      );
    }

    // Extract IDs
    const mockSignalIds = analysis.mockSignals.map((s) => s._id);

    if (process.env.NODE_ENV !== 'production') console.log(
      `🗑️  [CLEANUP] Preparing to delete ${mockSignalIds.length} mock signals...`
    );

    // Delete them using transaction
    const result = await deleteMockSignals(mockSignalIds);

    if (process.env.NODE_ENV !== 'production') console.log(`✅ [CLEANUP] Cleanup complete:
      - Signals deleted: ${result.deletedSignals}
      - Trades deleted: ${result.deletedTrades}
    `);

    return NextResponse.json(
      {
        success: true,
        message: `Successfully deleted ${result.deletedSignals} mock signals and ${result.deletedTrades} associated trades`,
        deletedSignals: result.deletedSignals,
        deletedTrades: result.deletedTrades,
        mockSignalsDeleted: analysis.mockSignals,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ [CLEANUP] Error deleting mock signals:", error);
    return NextResponse.json(
      {
        error: "Failed to delete mock signals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
