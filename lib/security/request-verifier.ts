import { NextResponse } from "next/server";
import crypto from "crypto";

const TIMESTAMP_TOLERANCE = 300000;
const SIGNATURE_HEADER = "x-signature";
const TIMESTAMP_HEADER = "x-timestamp";
const NONCE_HEADER = "x-nonce";

const nonceCache = new Map<string, number>();
const NONCE_CLEANUP_INTERVAL = 600000;

setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of nonceCache.entries()) {
    if (now - timestamp > TIMESTAMP_TOLERANCE) {
      nonceCache.delete(nonce);
    }
  }
}, NONCE_CLEANUP_INTERVAL);

function generateSignature(payload: string, secret: string, timestamp: string): string {
  const message = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function signRequest(payload: string, secret: string): {
  signature: string;
  timestamp: string;
  nonce: string;
} {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = generateSignature(payload, secret, timestamp);

  return { signature, timestamp, nonce };
}

export async function verifyRequestSignature(
  request: Request,
  secret: string
): Promise<NextResponse | null> {
  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  const nonce = request.headers.get(NONCE_HEADER);

  if (!signature || !timestamp || !nonce) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MISSING_SIGNATURE_HEADERS",
          message: "Required signature headers are missing",
          statusCode: 401,
        },
      },
      { status: 401 }
    );
  }

  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();

  if (isNaN(requestTime) || Math.abs(now - requestTime) > TIMESTAMP_TOLERANCE) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_TIMESTAMP",
          message: "Request timestamp is invalid or expired",
          statusCode: 401,
        },
      },
      { status: 401 }
    );
  }

  if (nonceCache.has(nonce)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DUPLICATE_NONCE",
          message: "Request has already been processed",
          statusCode: 401,
        },
      },
      { status: 401 }
    );
  }

  let payload = "";
  try {
    payload = await request.clone().text();
  } catch {
    payload = "";
  }

  const expectedSignature = generateSignature(payload, secret, timestamp);

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_SIGNATURE",
          message: "Request signature is invalid",
          statusCode: 401,
        },
      },
      { status: 401 }
    );
  }

  nonceCache.set(nonce, requestTime);

  return null;
}
