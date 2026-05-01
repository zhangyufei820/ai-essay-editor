import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { applyRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const rateLimited = applyRateLimit(request, { keyPrefix: 'admin-verify', maxRequests: 10 });
    if (rateLimited) return rateLimited;

    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token missing' },
        { status: 401 }
      );
    }

    const isValid = await verifyAdminToken(token);

    if (!isValid) {
      return NextResponse.json(
        { valid: false, error: 'Token invalid' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      valid: true,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Admin verify error:', error);
    return NextResponse.json(
      { valid: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
