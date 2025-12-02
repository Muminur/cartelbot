import { NextRequest, NextResponse } from "next/server";
import { formatErrorResponse } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordConnection, DiscordMessage, Signal, User } from "@/lib/db/models";
import { parseSignal } from "@/lib/parser";
import { executeSignalTrade } from "@/lib/binance";
import { serializeResponse } from "@/lib/utils/serialize";
import { Types } from "mongoose";
import { verifySignature } from "@/lib/encryption";

interface WebhookMessagePayload {
  userId: string;
  connectionId: string;
  discordMessageId: string;
  serverId: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  timestamp: string; // ISO string
}

/**
 * POST /api/discord/webhook/message
 * Receives messages from Python Discord service
 * Verifies webhook secret, parses signals, and executes trades
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const webhookSecret = request.headers.get("X-Webhook-Secret");
    const expectedSecret = process.env.DISCORD_WEBHOOK_SECRET;

    if (!expectedSecret) {
      console.error("[Discord Webhook] DISCORD_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Webhook not configured",
            code: "CONFIGURATION_ERROR",
            statusCode: 500,
          },
        },
        { status: 500 }
      );
    }

    if (!webhookSecret || webhookSecret !== expectedSecret) {
      console.error("[Discord Webhook] Invalid webhook secret");
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Unauthorized",
            code: "UNAUTHORIZED",
            statusCode: 401,
          },
        },
        { status: 401 }
      );
    }

    await connectDB();

    // Parse request body
    const body: WebhookMessagePayload = await request.json();
    const {
      userId,
      connectionId,
      discordMessageId,
      serverId,
      channelId,
      authorId,
      authorUsername,
      content,
      timestamp,
    } = body;

    // Validate required fields
    if (
      !userId ||
      !connectionId ||
      !discordMessageId ||
      !serverId ||
      !channelId ||
      !authorId ||
      !authorUsername ||
      !content ||
      !timestamp
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Missing required fields",
            code: "VALIDATION_ERROR",
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Webhook] Message received:", {
        userId,
        connectionId,
        discordMessageId,
        channelId,
      });
    }

    // Verify user and connection exist
    const userObjectId = new Types.ObjectId(userId);
    const connectionObjectId = new Types.ObjectId(connectionId);

    const [user, connection] = await Promise.all([
      User.findById(userObjectId),
      DiscordConnection.findOne({
        _id: connectionObjectId,
        userId: userObjectId,
      }),
    ]);

    if (!user || !connection) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "User or connection not found",
            code: "NOT_FOUND",
            statusCode: 404,
          },
        },
        { status: 404 }
      );
    }

    // Check if connection is active
    if (!connection.isActive || connection.status !== "active") {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Webhook] Connection not active, ignoring message");
      }
      return NextResponse.json({
        success: true,
        data: {
          message: "Connection not active, message ignored",
        },
      });
    }

    // Check for duplicate message
    const existingMessage = await DiscordMessage.findOne({
      discordMessageId,
      channelId,
    });

    if (existingMessage) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Webhook] Duplicate message, ignoring");
      }
      return NextResponse.json({
        success: true,
        data: {
          message: "Duplicate message, ignored",
        },
      });
    }

    // Create Discord message document
    const discordMessage = await DiscordMessage.create({
      userId: userObjectId,
      connectionId: connectionObjectId,
      discordMessageId,
      serverId,
      channelId,
      authorId,
      authorUsername,
      content,
      timestamp: new Date(timestamp),
      processingStatus: "pending",
      parseErrors: [],
    });

    // Parse signal from message content
    const parsed = parseSignal(content);

    if (process.env.NODE_ENV !== "production") {
      console.log("[Discord Webhook] Signal parsed:", {
        symbol: parsed.symbol,
        confidence: parsed.confidence,
        hasErrors: parsed.errors.length > 0,
      });
    }

    // Check confidence threshold (70%)
    if (parsed.confidence < 70) {
      // Low confidence - mark as ignored
      discordMessage.processingStatus = "ignored";
      discordMessage.parseErrors = parsed.errors;
      await discordMessage.save();

      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Webhook] Low confidence signal ignored:", {
          confidence: parsed.confidence,
          errors: parsed.errors,
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          message: "Signal confidence too low, ignored",
          confidence: parsed.confidence,
        },
      });
    }

    // Create Signal document
    const signal = await Signal.create({
      userId: userObjectId,
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: parsed.targets,
      stopLoss: parsed.stopLoss,
      currentMarketPrice: parsed.currentMarketPrice,
      status: "parsed",
      rawSignal: content,
      isImageSignal: false,
      parseErrors: parsed.errors,
      source: "discord",
      discordMessageId,
      discordChannelId: channelId,
    });

    // Update Discord message with signal info
    discordMessage.processingStatus = "parsed";
    discordMessage.parsedSignal = {
      symbol: parsed.symbol,
      entries: parsed.entries,
      targets: parsed.targets,
      stopLoss: parsed.stopLoss,
      confidence: parsed.confidence,
    };
    discordMessage.signalId = signal._id as Types.ObjectId;
    await discordMessage.save();

    // Check if auto-execute is enabled
    if (!connection.autoExecute) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Webhook] Auto-execute disabled, signal created only");
      }

      return NextResponse.json({
        success: true,
        data: serializeResponse({
          message: "Signal parsed and saved",
          signalId: signal._id,
        }),
      });
    }

    // Execute trade if auto-execute is enabled
    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("[Discord Webhook] Executing trade for signal:", signal._id);
      }

      const tradeResult = await executeSignalTrade({
        userId: userObjectId,
        signalId: signal._id as Types.ObjectId,
        investmentAmount: user.investmentAmount || 100,
        positionSizingMethod: user.positionSizingMethod || "fixed",
        testnet: user.useTestnet || false,
      });

      if (tradeResult.success && tradeResult.tradeId) {
        // Update Discord message with trade info
        discordMessage.processingStatus = "executed";
        discordMessage.tradeId = tradeResult.tradeId as Types.ObjectId;
        await discordMessage.save();

        // Update signal status
        await Signal.updateOne(
          { _id: signal._id },
          { status: "executing" }
        );

        // Update connection last processed time
        await DiscordConnection.updateOne(
          { _id: connectionObjectId },
          {
            lastMessageId: discordMessageId,
            lastProcessedAt: new Date(),
            errorCount: 0,
          }
        );

        if (process.env.NODE_ENV !== "production") {
          console.log("[Discord Webhook] Trade executed successfully:", {
            signalId: signal._id,
            tradeId: tradeResult.tradeId,
          });
        }

        return NextResponse.json({
          success: true,
          data: serializeResponse({
            message: "Signal parsed and trade executed",
            signalId: signal._id,
            tradeId: tradeResult.tradeId,
          }),
        });
      } else {
        // Trade execution failed
        discordMessage.processingStatus = "failed";
        discordMessage.executionError = tradeResult.error || "Trade execution failed";
        await discordMessage.save();

        await Signal.updateOne(
          { _id: signal._id },
          {
            status: "failed",
            executionError: tradeResult.error,
          }
        );

        // Increment connection error count
        await DiscordConnection.updateOne(
          { _id: connectionObjectId },
          {
            $inc: { errorCount: 1 },
            lastError: tradeResult.error,
            lastErrorAt: new Date(),
          }
        );

        console.error("[Discord Webhook] Trade execution failed:", {
          signalId: signal._id,
          error: tradeResult.error,
        });

        return NextResponse.json({
          success: true,
          data: serializeResponse({
            message: "Signal parsed but trade execution failed",
            signalId: signal._id,
            error: tradeResult.error,
          }),
        });
      }
    } catch (tradeError) {
      console.error("[Discord Webhook] Trade execution error:", tradeError);

      // Update Discord message
      discordMessage.processingStatus = "failed";
      discordMessage.executionError =
        tradeError instanceof Error ? tradeError.message : "Unknown error";
      await discordMessage.save();

      await Signal.updateOne(
        { _id: signal._id },
        {
          status: "failed",
          executionError:
            tradeError instanceof Error ? tradeError.message : "Unknown error",
        }
      );

      return NextResponse.json({
        success: true,
        data: serializeResponse({
          message: "Signal parsed but trade execution failed",
          signalId: signal._id,
          error: tradeError instanceof Error ? tradeError.message : "Unknown error",
        }),
      });
    }
  } catch (error) {
    console.error("POST /api/discord/webhook/message error:", error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, ...errorResponse },
      { status: errorResponse.error.statusCode }
    );
  }
}
