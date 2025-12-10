import { User } from "@/lib/db/models";
import { getSessionCookie } from "./cookies";
import { verifySessionToken } from "./jwt";
import { IUser } from "@/types";
import { connectDB } from "@/lib/db";

export * from "./jwt";
export * from "./cookies";

export async function getCurrentUser(): Promise<IUser | null> {
  const diagnosticId = `auth-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    // Step 1: Get session cookie
    const token = await getSessionCookie();
    if (!token) {
      // Normal case - no session cookie found
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[${diagnosticId}] No session cookie found`);
      }
      return null;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${diagnosticId}] Session cookie found (length: ${token.length})`);
    }

    // Step 2: Verify JWT token
    let payload;
    try {
      payload = verifySessionToken(token);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[${diagnosticId}] JWT verified successfully`, {
          userId: payload.userId,
          email: payload.email,
          type: payload.type
        });
      }
    } catch (jwtError) {
      // JWT verification failed - this is the most likely cause of logout
      console.error(`[${diagnosticId}] JWT verification failed:`, {
        error: jwtError instanceof Error ? jwtError.message : String(jwtError),
        name: jwtError instanceof Error ? jwtError.name : "Unknown",
        tokenLength: token.length,
        tokenPreview: token.substring(0, 20) + "...",
      });
      return null;
    }

    // Step 3: Connect to database
    const dbStartTime = Date.now();
    await connectDB();
    const dbConnectTime = Date.now() - dbStartTime;

    if (process.env.NODE_ENV !== 'production' || dbConnectTime > 1000) {
      console.log(`[${diagnosticId}] Database connected in ${dbConnectTime}ms`);
    }

    // Step 4: Query user
    const queryStartTime = Date.now();
    // Select encrypted API key fields to check if user has configured keys
    const user = await User.findById(payload.userId).select("+encryptedApiKey +encryptedApiSecret");
    const queryTime = Date.now() - queryStartTime;

    if (process.env.NODE_ENV !== 'production' || queryTime > 500) {
      console.log(`[${diagnosticId}] User query completed in ${queryTime}ms`);
    }

    if (!user) {
      console.warn(`[${diagnosticId}] User not found for ID: ${payload.userId} (possible deleted account)`);
      return null;
    }

    // Step 5: Check user status
    if (!user.isActive) {
      console.warn(`[${diagnosticId}] User account is inactive`, {
        userId: payload.userId,
        email: user.email,
        isActive: user.isActive
      });
      return null;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${diagnosticId}] Authentication successful for user ${payload.userId}`);
    }

    return user;
  } catch (error) {
    // Log errors with comprehensive context for debugging
    console.error(`[${diagnosticId}] getCurrentUser: Unexpected error`, {
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
    });
    return null;
  }
}

export async function requireAuth(): Promise<IUser> {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error("Authentication required");
    error.name = "AuthenticationError";
    throw error;
  }
  return user;
}

export async function getUserFromRequest(request: Request): Promise<{
  user: IUser | null;
  error: string | null;
}> {
  try {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
      return { user: null, error: "No session found" };
    }

    const sessionToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("session="))
      ?.split("=")[1];

    if (!sessionToken) {
      return { user: null, error: "No session token" };
    }

    const payload = verifySessionToken(sessionToken);
    await connectDB();

    const user = await User.findById(payload.userId);
    if (!user) {
      return { user: null, error: "User not found" };
    }

    if (!user.isActive) {
      return { user: null, error: "Account inactive" };
    }

    return { user, error: null };
  } catch (error) {
    return {
      user: null,
      error: error instanceof Error ? error.message : "Authentication failed",
    };
  }
}
