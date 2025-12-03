import axios, { AxiosInstance } from "axios";
import { env } from "@/lib/config";

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
   * Start a new Discord client for a user
   * @param data User ID, Discord token, server ID, and channel ID
   * @returns Success status and message
   */
  async startClient(
    data: ClientStartRequest
  ): Promise<PythonServiceResponse> {
    try {
      const response = await this.client.post<PythonServiceResponse>(
        "/client/start",
        data
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;
        if (process.env.NODE_ENV !== "production") {
          console.error("[PythonServiceClient] Start client error:", {
            status: error.response?.status,
            message: errorMessage,
            userId: data.userId,
          });
        }
        return {
          success: false,
          error: errorMessage,
        };
      }
      console.error("[PythonServiceClient] Unexpected error:", error);
      return {
        success: false,
        error: "Failed to communicate with Discord service",
      };
    }
  }

  /**
   * Stop a Discord client for a user
   * @param userId User ID to stop the client for
   * @returns Success status and message
   */
  async stopClient(userId: string): Promise<PythonServiceResponse> {
    try {
      const response = await this.client.post<PythonServiceResponse>(
        "/client/stop",
        { userId }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;
        if (process.env.NODE_ENV !== "production") {
          console.error("[PythonServiceClient] Stop client error:", {
            status: error.response?.status,
            message: errorMessage,
            userId,
          });
        }
        return {
          success: false,
          error: errorMessage,
        };
      }
      console.error("[PythonServiceClient] Unexpected error:", error);
      return {
        success: false,
        error: "Failed to communicate with Discord service",
      };
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
    try {
      const response = await this.client.get<
        PythonServiceResponse<ClientStatusResponse>
      >(`/client/status?userId=${encodeURIComponent(userId)}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;
        if (process.env.NODE_ENV !== "production") {
          console.error("[PythonServiceClient] Get status error:", {
            status: error.response?.status,
            message: errorMessage,
            userId,
          });
        }
        return {
          success: false,
          error: errorMessage,
        };
      }
      console.error("[PythonServiceClient] Unexpected error:", error);
      return {
        success: false,
        error: "Failed to communicate with Discord service",
      };
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
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;
        if (process.env.NODE_ENV !== "production") {
          console.error("[PythonServiceClient] Health check error:", {
            status: error.response?.status,
            message: errorMessage,
          });
        }
        return {
          success: false,
          error: errorMessage,
        };
      }
      console.error("[PythonServiceClient] Unexpected error:", error);
      return {
        success: false,
        error: "Failed to communicate with Discord service",
      };
    }
  }

  /**
   * Validate a Discord token by testing it with the Python service
   * @param token Discord user token to validate
   * @returns Validation result with user ID and username if valid
   */
  async validateToken(
    token: string
  ): Promise<
    PythonServiceResponse<{
      valid: boolean;
      userId?: string;
      username?: string;
    }>
  > {
    try {
      const response = await this.client.post<
        PythonServiceResponse<{
          valid: boolean;
          userId?: string;
          username?: string;
        }>
      >("/token/validate", { token });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message;
        if (process.env.NODE_ENV !== "production") {
          console.error("[PythonServiceClient] Validate token error:", {
            status: error.response?.status,
            message: errorMessage,
          });
        }
        return {
          success: false,
          data: { valid: false },
          error: errorMessage,
        };
      }
      console.error("[PythonServiceClient] Unexpected error:", error);
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
