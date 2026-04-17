import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token missing' },
        { status: 400 }
      );
    }

    const isValid = verifyAdminToken(token);

    return NextResponse.json({
      valid: isValid,
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