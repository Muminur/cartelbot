import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { formatErrorResponse } from "@/lib/utils/errors";
import { connectDB } from "@/lib/db";
import { DiscordConnection, DiscordMessage, Signal, User } from "@/lib/db/models";
import { parseSignal } from "@/lib/parser";
import { executeSignalTrade, createOCOOrders } from "@/lib/binance";
import { PositionSizingMethod } from "@/lib/binance/position-sizing";
import { TRADE_EXECUTION } from "@/lib/constants";
import { serializeResponse } from "@/lib/utils/serialize";
import { Types } from "mongoose";
import { discordEventEmitter } from "@/lib/discord/event-emitter";

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

    // Use timing-safe comparison to prevent timing attacks
    const isValidSecret =
      webhookSecret &&
      webhookSecret.length === expectedSecret.length &&
      crypto.timingSafeEqual(
        Buffer.from(webhookSecret),
        Buffer.from(expectedSecret)
      );

    if (!isValidSecret) {
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
      User.findById(userObjectId).lean<{
        investmentAmount?: number;
        positionSizingMethod?: PositionSizingMethod;
        useTestnet?: boolean;
      }>(),
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

    // Emit: Message received event
    discordEventEmitter.emitSignalEvent({
      type: "message_received",
      userId,
      connectionId,
      messageId: String(discordMessage._id),
      timestamp: new Date(),
      data: {
        message: `New message from ${authorUsername}`,
        status: "pending",
      },
    });

    // Parse signal from message content
    discordEventEmitter.emitSignalEvent({
      type: "parsing",
      userId,
      connectionId,
      messageId: String(discordMessage._id),
      timestamp: new Date(),
      data: {
        message: "Parsing signal...",
        status: "parsing",
      },
    });

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

      // Emit: Parsing failed event
      discordEventEmitter.emitSignalEvent({
        type: "failed",
        userId,
        connectionId,
        messageId: String(discordMessage._id),
        timestamp: new Date(),
        data: {
          message: `Low confidence (${parsed.confidence}%). Signal ignored.`,
          status: "ignored",
          confidence: parsed.confidence,
          error: parsed.errors.join(", "),
        },
      });

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

    // Emit: Signal parsed successfully
    discordEventEmitter.emitSignalEvent({
      type: "parsed",
      userId,
      connectionId,
      messageId: String(discordMessage._id),
      timestamp: new Date(),
      data: {
        symbol: parsed.symbol,
        message: `Signal parsed: ${parsed.symbol}`,
        status: "parsed",
        confidence: parsed.confidence,
        signalId: String(signal._id),
      },
    });

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

      // Emit: Starting trade execution
      discordEventEmitter.emitSignalEvent({
        type: "executing",
        userId,
        connectionId,
        messageId: String(discordMessage._id),
        timestamp: new Date(),
        data: {
          symbol: parsed.symbol,
          message: `Executing trade for ${parsed.symbol}...`,
          status: "executing",
          signalId: String(signal._id),
        },
      });

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

        // Update signal status to executing (buy complete, OCO pending)
        await Signal.updateOne(
          { _id: signal._id },
          { status: "executing" }
        );

        // Emit: Buy order executed, creating OCO orders
        discordEventEmitter.emitSignalEvent({
          type: "executing",
          userId,
          connectionId,
          messageId: String(discordMessage._id),
          timestamp: new Date(),
          data: {
            symbol: parsed.symbol,
            message: `Buy order filled for ${parsed.symbol}. Creating OCO orders...`,
            status: "executing",
            signalId: String(signal._id),
            tradeId: String(tradeResult.tradeId),
          },
        });

        // CRITICAL: Create OCO orders for take profit and stop loss
        // Wait for balance settlement (testnet needs more time)
        const testnet = user.useTestnet || false;
        const settlementDelay = testnet
          ? TRADE_EXECUTION.TESTNET_SETTLEMENT_DELAY_MS
          : TRADE_EXECUTION.MAINNET_SETTLEMENT_DELAY_MS;

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[Discord Webhook] Waiting ${settlementDelay}ms for balance settlement ` +
            `(${testnet ? "testnet" : "mainnet"}) before creating OCO orders`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, settlementDelay));

        // Create OCO orders
        const ocoResult = await createOCOOrders(
          tradeResult.tradeId as Types.ObjectId,
          testnet
        );

        if (ocoResult.success) {
          if (process.env.NODE_ENV !== "production") {
            console.log("[Discord Webhook] OCO orders created successfully:", {
              signalId: signal._id,
              tradeId: tradeResult.tradeId,
              ocoOrderCount: ocoResult.orders?.length || 0,
            });
          }

          // Update signal status to active (trade fully executed)
          await Signal.updateOne(
            { _id: signal._id },
            { status: "active" }
          );

          // Emit: Trade completed successfully
          discordEventEmitter.emitSignalEvent({
            type: "completed",
            userId,
            connectionId,
            messageId: String(discordMessage._id),
            timestamp: new Date(),
            data: {
              symbol: parsed.symbol,
              message: `Trade executed: ${parsed.symbol} with ${ocoResult.orders?.length || 0} OCO orders`,
              status: "executed",
              signalId: String(signal._id),
              tradeId: String(tradeResult.tradeId),
            },
          });
        } else {
          // OCO creation failed but buy order succeeded
          console.error("[Discord Webhook] OCO creation failed:", {
            signalId: signal._id,
            tradeId: tradeResult.tradeId,
            error: ocoResult.error,
          });

          // Update signal with OCO error (but keep as executing since buy succeeded)
          await Signal.updateOne(
            { _id: signal._id },
            {
              status: "executing",
              executionError: `OCO creation failed: ${ocoResult.error}`,
            }
          );

          // Emit: OCO creation failed
          discordEventEmitter.emitSignalEvent({
            type: "failed",
            userId,
            connectionId,
            messageId: String(discordMessage._id),
            timestamp: new Date(),
            data: {
              symbol: parsed.symbol,
              message: `Buy order succeeded but OCO creation failed: ${ocoResult.error}`,
              status: "partial",
              signalId: String(signal._id),
              tradeId: String(tradeResult.tradeId),
              error: ocoResult.error,
            },
          });
        }

        // Update connection last processed time
        // Track partial execution (buy succeeded but OCO failed) in error state
        await DiscordConnection.updateOne(
          { _id: connectionObjectId },
          ocoResult.success
            ? {
                lastMessageId: discordMessageId,
                lastProcessedAt: new Date(),
                errorCount: 0,
              }
            : {
                lastMessageId: discordMessageId,
                lastProcessedAt: new Date(),
                $inc: { errorCount: 1 },
                lastError: `OCO creation failed: ${ocoResult.error}`,
                lastErrorAt: new Date(),
              }
        );

        if (process.env.NODE_ENV !== "production") {
          console.log("[Discord Webhook] Trade executed successfully:", {
            signalId: signal._id,
            tradeId: tradeResult.tradeId,
            ocoCreated: ocoResult.success,
          });
        }

        return NextResponse.json({
          success: true,
          data: serializeResponse({
            message: ocoResult.success
              ? "Signal parsed, trade executed, and OCO orders created"
              : "Signal parsed and trade executed (OCO creation failed)",
            signalId: signal._id,
            tradeId: tradeResult.tradeId,
            ocoCreated: ocoResult.success,
            ocoError: ocoResult.success ? undefined : ocoResult.error,
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

        // Emit: Trade execution failed
        discordEventEmitter.emitSignalEvent({
          type: "failed",
          userId,
          connectionId,
          messageId: String(discordMessage._id),
          timestamp: new Date(),
          data: {
            symbol: parsed.symbol,
            message: `Trade execution failed: ${tradeResult.error}`,
            status: "failed",
            signalId: String(signal._id),
            error: tradeResult.error,
          },
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

// Force dynamic rendering for webhook endpoint
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
