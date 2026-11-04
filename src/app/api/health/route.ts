import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`
    
    // Check environment variables
    const env = {
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
      REDIS_URL: process.env.REDIS_URL ? 'SET' : 'NOT_SET',
      GROQ_API_KEY: process.env.GROQ_API_KEY ? 'SET' : 'NOT_SET',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT_SET',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT_SET',
      // #88: whether users may point their own key at a custom base URL.
      ALLOW_CUSTOM_LLM_BASE_URL: process.env.ALLOW_CUSTOM_LLM_BASE_URL === 'true' ? 'true' : 'false',
    }

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      environment: env,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json(
      {
        status: 'error',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
