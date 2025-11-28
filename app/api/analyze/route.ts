import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // 使用 Edge Runtime 极速模式

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    // 1. 把文件转手上传给 Dify
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    uploadFormData.append('user', 'user-123'); // 企业级这里可以换成真实用户ID

    const uploadRes = await fetch(`${process.env.DIFY_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.DIFY_API_KEY}` },
      body: uploadFormData,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.message || 'Dify upload failed');

    // 2. 触发 AI 工作流
    const workflowBody = {
      inputs: {}, 
      response_mode: 'streaming',
      user: 'user-123',
      files: [
        {
          type: 'image', 
          transfer_method: 'local_file',
          upload_file_id: uploadData.id,
        },
      ],
    };

    const workflowRes = await fetch(`${process.env.DIFY_BASE_URL}/workflows/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workflowBody),
    });

    // 3. 把 Dify 的思考过程“流”回给前端
    return new Response(workflowRes.body, {
      headers: { 'Content-Type': 'text/event-stream' },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}