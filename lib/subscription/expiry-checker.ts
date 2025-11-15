import { connectDB } from "@/lib/db/connection";
import { Subscription } from "@/lib/db/models/Subscription";
import { User } from "@/lib/db/models/User";

export async function checkExpiredSubscriptions(): Promise<{
  expired: number;
  errors: number;
}> {
  await connectDB();

  const now = new Date();
  let expiredCount = 0;
  let errorCount = 0;

  const expiredSubs = await Subscription.find({
    status: "confirmed",
    endDate: { $lt: now },
  });

  for (const sub of expiredSubs) {
    try {
      sub.status = "expired";
      await sub.save();

      await User.findByIdAndUpdate(sub.userId, {
        subscriptionTier: "free",
        subscriptionExpiry: null,
      });

      expiredCount++;
    } catch (error) {
      console.error(`Failed to expire subscription ${sub._id}:`, error);
      errorCount++;
    }
  }

  if (expiredCount > 0) {
    console.log(`[Expiry Checker] Expired ${expiredCount} subscription(s)`);
  }

  if (errorCount > 0) {
    console.error(`[Expiry Checker] Failed to expire ${errorCount} subscription(s)`);
  }

  return { expired: expiredCount, errors: errorCount };
}
