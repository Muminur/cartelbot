import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((url) => url.startsWith("mongodb"), {
      message: "DATABASE_URL must be a valid MongoDB connection string",
    }),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  NEXT_PUBLIC_API_URL: z
    .string()
    .url("NEXT_PUBLIC_API_URL must be a valid URL")
    .min(1, "NEXT_PUBLIC_API_URL is required"),

  BINANCE_API_URL: z
    .string()
    .url("BINANCE_API_URL must be a valid URL")
    .default("https://api.binance.com"),

  BINANCE_WS_URL: z
    .string()
    .refine((url) => url.startsWith("wss://"), {
      message: "BINANCE_WS_URL must be a valid WebSocket URL",
    })
    .default("wss://stream.binance.com:9443"),

  BINANCE_TESTNET_URL: z
    .string()
    .url("BINANCE_TESTNET_URL must be a valid URL")
    .default("https://testnet.binance.vision"),

  BINANCE_TESTNET_WS: z
    .string()
    .refine((url) => url.startsWith("wss://"), {
      message: "BINANCE_TESTNET_WS must be a valid WebSocket URL",
    })
    .default("wss://stream.testnet.binance.vision:9443"),

  ENCRYPTION_KEY: z
    .string()
    .min(32, "ENCRYPTION_KEY must be at least 32 characters")
    .max(256, "ENCRYPTION_KEY is too long"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .max(256, "JWT_SECRET is too long"),

  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters")
    .max(256, "NEXTAUTH_SECRET is too long"),

  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL").optional(),

  RESEND_API_KEY: z
    .string()
    .refine(
      (val) => !val || val.startsWith("re_"),
      "RESEND_API_KEY must start with 're_' when provided"
    )
    .optional(),

  ADMIN_EMAILS: z
    .string()
    .refine(
      (val) => val.split(",").every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())),
      "ADMIN_EMAILS must be a comma-separated list of valid emails"
    )
    .default("admin@cartelbot.coinspree.cc"),

  PAYMENT_WALLET_ADDRESS: z
    .string()
    .regex(/^T[a-zA-Z0-9]{33}$/, "PAYMENT_WALLET_ADDRESS must be a valid TRC20 wallet address (T followed by 33 characters)")
    .refine(
      (val) => val !== "TYourWalletAddressHere123456789ABCDEF",
      "Production wallet address not configured - replace placeholder"
    ),

  TRON_MIN_CONFIRMATIONS: z
    .string()
    .regex(/^\d+$/, "TRON_MIN_CONFIRMATIONS must be a number")
    .transform((val) => parseInt(val, 10))
    .default("19"),

  ADMIN_IP_WHITELIST: z
    .string()
    .optional()
    .default(""),

  SENTRY_DSN: z
    .string()
    .url("SENTRY_DSN must be a valid URL")
    .refine(
      (val) => !val || val.includes('sentry.io'),
      "SENTRY_DSN must be a valid Sentry URL"
    )
    .optional(),

  NEXT_PUBLIC_SENTRY_DSN: z
    .string()
    .url("NEXT_PUBLIC_SENTRY_DSN must be a valid URL")
    .optional(),

  SENTRY_ENVIRONMENT: z
    .enum(['development', 'staging', 'production'])
    .default('production'),

  DISCORD_PYTHON_SERVICE_URL: z
    .string()
    .url("DISCORD_PYTHON_SERVICE_URL must be a valid URL")
    .default("http://localhost:8000"),

  DISCORD_WEBHOOK_SECRET: z
    .string()
    .min(32, "DISCORD_WEBHOOK_SECRET must be at least 32 characters")
    .refine(
      (val) => {
        // Security: In production, ensure it's not a default/example value
        if (process.env.NODE_ENV === "production") {
          const insecureValues = ["your_secret_here", "changeme", "test", "secret"];
          return !insecureValues.some(insecure => val.toLowerCase().includes(insecure));
        }
        return true;
      },
      "DISCORD_WEBHOOK_SECRET must be a secure random value in production (not a default/test value)"
    ),

  DISCORD_SELFBOT_ENABLED: z
    .string()
    .refine(
      (val) => val === "true" || val === "false",
      "DISCORD_SELFBOT_ENABLED must be 'true' or 'false'"
    )
    .transform((val) => val === "true")
    .default("true"),

  DISCORD_MAX_CONNECTIONS_PER_USER: z
    .string()
    .regex(/^\d+$/, "DISCORD_MAX_CONNECTIONS_PER_USER must be a number")
    .transform((val) => parseInt(val, 10))
    .default("3"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let validationError: Error | null = null;

function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  if (validationError) throw validationError;

  try {
    const env = {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      BINANCE_API_URL: process.env.BINANCE_API_URL,
      BINANCE_WS_URL: process.env.BINANCE_WS_URL,
      BINANCE_TESTNET_URL: process.env.BINANCE_TESTNET_URL,
      BINANCE_TESTNET_WS: process.env.BINANCE_TESTNET_WS,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
      JWT_SECRET: process.env.JWT_SECRET,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      ADMIN_EMAILS: process.env.ADMIN_EMAILS,
      PAYMENT_WALLET_ADDRESS: process.env.PAYMENT_WALLET_ADDRESS,
      TRON_MIN_CONFIRMATIONS: process.env.TRON_MIN_CONFIRMATIONS,
      ADMIN_IP_WHITELIST: process.env.ADMIN_IP_WHITELIST,
      SENTRY_DSN: process.env.SENTRY_DSN,
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
      SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
      DISCORD_PYTHON_SERVICE_URL: process.env.DISCORD_PYTHON_SERVICE_URL,
      DISCORD_WEBHOOK_SECRET: process.env.DISCORD_WEBHOOK_SECRET,
      DISCORD_SELFBOT_ENABLED: process.env.DISCORD_SELFBOT_ENABLED,
      DISCORD_MAX_CONNECTIONS_PER_USER: process.env.DISCORD_MAX_CONNECTIONS_PER_USER,
    };

    const parsed = envSchema.safeParse(env);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;

      console.error("======================================");
      console.error("ENVIRONMENT VALIDATION FAILED");
      console.error("======================================");
      console.error("");
      console.error("The following environment variables are missing or invalid:");
      console.error("");

      for (const [field, messages] of Object.entries(errors)) {
        if (messages && messages.length > 0) {
          console.error(`  ${field}:`);
          messages.forEach(msg => {
            console.error(`    - ${msg}`);
          });
          console.error("");
        }
      }

      console.error("Please check your .env file or environment configuration.");
      console.error("See .env.example for required variables.");
      console.error("======================================");

      validationError = new Error("Invalid environment variables. Check logs for details.");
      throw validationError;
    }

    if (!parsed.data) {
      throw new Error("Environment validation succeeded but returned null data");
    }

    cachedEnv = parsed.data;
    return cachedEnv;
  } catch (error) {
    validationError = error instanceof Error ? error : new Error(String(error));
    throw validationError;
  }
}

export const env = getEnv();
