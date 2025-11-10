import mongoose from "mongoose";
import { env } from "@/lib/config";

type ConnectionCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: ConnectionCache | undefined;
}

const cached: ConnectionCache = global.mongooseCache || {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const options = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose
      .connect(env.DATABASE_URL, options)
      .then((mongooseInstance) => {
        if (env.NODE_ENV === "development") {
          console.warn("MongoDB connected successfully");
        }
        return mongooseInstance;
      })
      .catch((error) => {
        console.error("MongoDB connection error:", error);
        cached.promise = null;
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
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
