import { NextRequest, NextResponse } from 'next/server';
import { generateAdminToken } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: '请输入密码' },
        { status: 400 }
      );
    }

    const token = await generateAdminToken(password);
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: '密码错误' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 24 * 60 * 60 // 24小时（秒）
    });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}