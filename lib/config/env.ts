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
    .email("ADMIN_EMAILS must be a valid email")
    .default("admin@cartelbot.coinspree.cc"),
});

export type Env = z.infer<typeof envSchema>;

function getEnv(): Env {
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
  };

  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

export const env = getEnv();
