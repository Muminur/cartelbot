import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const startTime = Date.now();

    await connectDB();

    const mongoLatency = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: {
          status: 'connected',
          latency: `${mongoLatency}ms`,
        },
        api: {
          status: 'operational',
        },
      },
      environment: process.env.NODE_ENV,
      version: '1.0.0',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        environment: process.env.NODE_ENV,
      },
      { status: 503 }
    );
  }
}
