import mongoose from "mongoose";
import { env } from "@/lib/config";

type ConnectionCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  connecting: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: ConnectionCache | undefined;
}

const cached: ConnectionCache = global.mongooseCache || {
  conn: null,
  promise: null,
  connecting: false,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

// Retry utility function with exponential backoff
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

      // Don't retry on authentication errors or invalid connection strings
      if (
        error instanceof Error &&
        (error.message.includes("Authentication failed") ||
          error.message.includes("Invalid connection string"))
      ) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(
          `MongoDB connection attempt ${attempt + 1} failed. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  // Wait for any ongoing connection attempt to complete
  if (cached.connecting && cached.promise) {
    return cached.promise;
  }

  if (!cached.promise) {
    // Set connecting flag to prevent race condition
    cached.connecting = true;

    const options = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 30000, // Increased from 5000ms to 30000ms
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Added explicit connect timeout
      heartbeatFrequencyMS: 10000, // Check server health every 10 seconds
      retryWrites: true,
      retryReads: true,
    };

    cached.promise = retryWithBackoff(
      async () => {
        try {
          const mongooseInstance = await mongoose.connect(env.DATABASE_URL, options);
          if (env.NODE_ENV === "development") {
            console.warn("MongoDB connected successfully");
          }
          return mongooseInstance;
        } catch (error) {
          console.error("MongoDB connection error:", error);
          console.error("Error details:", {
            name: error instanceof Error ? error.name : "Unknown",
            message: error instanceof Error ? error.message : String(error),
            code: error && typeof error === "object" && "code" in error ? error.code : undefined,
          });
          throw error;
        }
      },
      3, // 3 retry attempts
      1000 // Start with 1 second delay
    ).catch((error) => {
      cached.promise = null;
      cached.connecting = false;
      throw error;
    });
  }

  try {
    cached.conn = await cached.promise;
    cached.connecting = false;
  } catch (error) {
    cached.promise = null;
    cached.connecting = false;
    throw error;
  }

  return cached.conn;
}

export async function disconnectDB(): Promise<void> {
  if (cached.conn) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
    if (env.NODE_ENV === "development") {
      console.warn("MongoDB disconnected");
    }
  }
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
