import { Signal } from "@/lib/db/models";
import { Types } from "mongoose";

/**
 * Centralized signal status management to prevent race conditions
 * and ensure consistent status updates across all trade lifecycle events.
 *
 * This helper function marks a signal as "completed" when any of these events occur:
 * - Target hit (OCO sell order filled)
 * - Stop loss hit (OCO stop loss triggered)
 * - Manual close (user manually closes position)
 *
 * It only updates signals currently in "executing" status to prevent
 * overwriting already completed/cancelled signals.
 */
export async function markSignalCompleted(
  signalId: Types.ObjectId | string,
  tradeId: Types.ObjectId | string,
  reason: "target" | "stop_loss" | "manual_close"
): Promise<void> {
  try {
    const result = await Signal.findOneAndUpdate(
      { _id: signalId, status: "executing" },
      { status: "completed" },
      { new: true }
    );

    if (result) {
      console.log(`Signal ${signalId} marked as completed (reason: ${reason}, trade: ${tradeId})`);
    } else {
      const signal = await Signal.findById(signalId);
      if (!signal) {
        console.warn(`Signal ${signalId} not found when marking trade ${tradeId} complete`);
      } else {
        console.info(`Signal ${signalId} already in status '${signal.status}' (trade: ${tradeId})`);
      }
    }
  } catch (error) {
    console.error(`Failed to update signal ${signalId}:`, error);
  }
}
