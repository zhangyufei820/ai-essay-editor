import { NextRequest, NextResponse } from 'next/server'
import rateLimiter, { createRateLimitResponse, getClientIP } from '@/lib/rate-limit'
import { generateAdminToken, isAdminPasswordConfigured } from '@/lib/admin-auth'

const LOGIN_LIMIT_PER_MINUTE = 10
const FAILURE_DELAY_MS = 800

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request)
    const limitResult = rateLimiter.check(`admin-auth:${ip}`, LOGIN_LIMIT_PER_MINUTE)

    if (!limitResult.allowed) {
      return createRateLimitResponse(limitResult.retryAfter!)
    }

    const body = await request.json()
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      )
    }

    if (!isAdminPasswordConfigured()) {
      await delay(FAILURE_DELAY_MS)
      return NextResponse.json(
        { success: false, error: 'Admin authentication is not configured' },
        { status: 503 }
      )
    }

    const token = await generateAdminToken(password)

    if (!token) {
      await delay(FAILURE_DELAY_MS)
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 24 * 60 * 60,
    })
  } catch (error) {
    console.error('Admin auth error:', error)
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
