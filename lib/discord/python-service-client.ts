import axios, { AxiosError, AxiosInstance } from "axios";

interface PythonServiceResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

interface ClientStartRequest {
  userId: string;
  connectionId: string;
  token: string;
  serverId: string;
  channelId: string;
}

interface ClientStatusResponse {
  status: "running" | "stopped" | "error";
  userId?: string;
  serverId?: string;
  channelId?: string;
  lastMessage?: string;
  lastProcessedAt?: string;
  errorCount?: number;
  lastError?: string;
}

interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  active_clients: number;
  version?: string;
}

interface TokenValidationResponse {
  valid: boolean;
  userId?: string;
  username?: string;
  discriminator?: string;
}

/** Connection error codes that indicate the service is not running */
const CONNECTION_ERROR_CODES = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"] as const;

/**
 * Client for communicating with the Python Discord selfbot service
 * Handles all HTTP requests to the Python service for managing Discord clients
 */
export class PythonServiceClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl =
      process.env.DISCORD_PYTHON_SERVICE_URL || "http://localhost:8000";
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10 second timeout
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Check if an error is a connection error (service not running)
   */
  private isConnectionError(error: AxiosError): boolean {
    return (
      CONNECTION_ERROR_CODES.includes(error.code as typeof CONNECTION_ERROR_CODES[number]) ||
      !error.response
    );
  }

  /**
   * Handle Axios errors with consistent error detection and logging
   * @param error The caught error
   * @param context Description of the operation for logging
   * @param metadata Additional metadata to log (safe - no sensitive data)
   * @returns Standardized error response
   */
  private handleAxiosError<T = unknown>(
    error: unknown,
    context: string,
    metadata?: Record<string, unknown>
  ): PythonServiceResponse<T> {
    if (axios.isAxiosError(error)) {
      const isConnError = this.isConnectionError(error);

      // Try to extract error message from multiple possible locations
      const errorMessage = isConnError
        ? "Discord selfbot service is not running"
        : error.response?.data?.detail || // FastAPI uses 'detail'
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;

      if (process.env.NODE_ENV !== "production") {
        console.error(`[PythonServiceClient] ${context}:`, {
          status: error.response?.status,
          code: error.code,
          message: errorMessage,
          isConnectionError: isConnError,
          responseData: error.response?.data, // Log full response for debugging
          ...metadata,
        });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    if (process.env.NODE_ENV !== "production") {
      console.error(`[PythonServiceClient] Unexpected error in ${context}:`, error);
    }

    return {
      success: false,
      error: "Failed to communicate with Discord service",
    };
  }

  /**
   * Start a new Discord client for a user
   * @param data User ID, Discord token, server ID, and channel ID
   * @returns Success status and message
   */
  async startClient(
    data: ClientStartRequest
  ): Promise<PythonServiceResponse> {
    // Input validation
    if (!data.userId || !data.connectionId || !data.token || !data.serverId || !data.channelId) {
      return {
        success: false,
        error: "Missing required parameters for client start",
      };
    }

    if (data.token.length < 50 || data.token.length > 150) {
      return {
        success: false,
        error: "Invalid Discord token format",
      };
    }

    try {
      const response = await this.client.post<PythonServiceResponse>(
        "/client/start",
        data
      );
      return response.data;
    } catch (error) {
      // Explicit metadata - prevents accidental token exposure
      return this.handleAxiosError(error, "Start client error", {
        userId: data.userId,
        serverId: data.serverId,
        channelId: data.channelId,
        // Deliberately omitting: token, connectionId
      });
    }
  }

  /**
   * Stop a Discord client for a user
   * @param userId User ID to stop the client for
   * @returns Success status and message
   */
  async stopClient(userId: string): Promise<PythonServiceResponse> {
    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    try {
      const response = await this.client.post<PythonServiceResponse>(
        "/client/stop",
        { userId }
      );
      return response.data;
    } catch (error) {
      // Special handling for 404 - client not found is a valid state
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return {
          success: false,
          error: "Client not found (already stopped or never started)",
        };
      }
      return this.handleAxiosError(error, "Stop client error", { userId });
    }
  }

  /**
   * Get status of a Discord client for a user
   * @param userId User ID to check status for
   * @returns Client status information
   */
  async getClientStatus(
    userId: string
  ): Promise<PythonServiceResponse<ClientStatusResponse>> {
    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    try {
      const response = await this.client.get<
        PythonServiceResponse<ClientStatusResponse>
      >(`/client/status?userId=${encodeURIComponent(userId)}`);
      return response.data;
    } catch (error) {
      return this.handleAxiosError<ClientStatusResponse>(
        error,
        "Get status error",
        { userId }
      );
    }
  }

  /**
   * Check health of the Python Discord service
   * @returns Health status, uptime, and active client count
   */
  async healthCheck(): Promise<PythonServiceResponse<HealthCheckResponse>> {
    try {
      const response = await this.client.get<
        PythonServiceResponse<HealthCheckResponse>
      >("/health");
      return response.data;
    } catch (error) {
      return this.handleAxiosError<HealthCheckResponse>(
        error,
        "Health check error"
      );
    }
  }

  /**
   * Validate a Discord token by testing it with the Python service
   * @param token Discord user token to validate
   * @returns Validation result with user ID and username if valid
   */
  async validateToken(
    token: string
  ): Promise<PythonServiceResponse<TokenValidationResponse>> {
    // Input validation
    if (!token || typeof token !== "string") {
      return {
        success: false,
        data: { valid: false },
        error: "Token is required",
      };
    }

    if (token.length < 50 || token.length > 150) {
      return {
        success: false,
        data: { valid: false },
        error: "Invalid token format",
      };
    }

    try {
      const response = await this.client.post<
        PythonServiceResponse<TokenValidationResponse>
      >("/token/validate", { token });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const isConnError = this.isConnectionError(error);

        const errorMessage = isConnError
          ? "Discord selfbot service is not running"
          : error.response?.data?.error ||
            error.response?.data?.message ||
            error.message;

        if (process.env.NODE_ENV !== "production") {
          console.error("[PythonServiceClient] Validate token error:", {
            status: error.response?.status,
            code: error.code,
            message: errorMessage,
            isConnectionError: isConnError,
          });
        }

        return {
          success: false,
          data: { valid: false },
          error: errorMessage,
        };
      }

      if (process.env.NODE_ENV !== "production") {
        console.error("[PythonServiceClient] Unexpected error:", error);
      }

      return {
        success: false,
        data: { valid: false },
        error: "Failed to communicate with Discord service",
      };
    }
  }
}

// Export singleton instance
export const pythonServiceClient = new PythonServiceClient();
