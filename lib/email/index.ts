import { Resend } from "resend";
import { env } from "@/lib/config";

let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on authentication/configuration errors
      if (
        error instanceof Error &&
        (error.message.includes("API key") ||
         error.message.includes("not configured") ||
         error.message.includes("authentication"))
      ) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(
          `Email send attempt ${attempt + 1} failed. Retrying in ${delay}ms...`,
          { error: error instanceof Error ? error.message : String(error) }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const client = getResendClient();

  const magicLink = `${env.NEXT_PUBLIC_API_URL}/verify?token=${token}`;

  await retryWithBackoff(async () => {
    const { error } = await client.emails.send({
      from: "CartelBot <noreply@cartelbot.coinspree.cc>",
      to: email,
      subject: "Your CartelBot Login Link",
      text: `
Welcome to CartelBot!

Sign in to your account by clicking the link below:

${magicLink}

This link will expire in 15 minutes for security reasons.

If you didn't request this email, you can safely ignore it.

---
CartelBot - Automated Binance Trading Bot
This is an automated email, please do not reply.
      `.trim(),
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">CartelBot</h1>
            </div>
            <div style="background: #f9fafb; padding: 40px 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1f2937; margin-top: 0;">Sign in to CartelBot</h2>
              <p style="color: #4b5563; font-size: 16px;">Click the button below to sign in to your account. This link will expire in 15 minutes.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Sign In</a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">If you didn't request this email, you can safely ignore it.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">CartelBot - Automated Binance Trading Bot<br>This is an automated email, please do not reply.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error("Failed to send magic link email:", error);
      throw new Error(`Failed to send magic link email: ${error.message || "Unknown error"}`);
    }
  }, 3, 1000);
}
