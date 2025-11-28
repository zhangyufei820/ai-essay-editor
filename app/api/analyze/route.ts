import { NextRequest, NextResponse } from 'next/server';

// 强制动态模式，防止静态缓存
export const dynamic = 'force-dynamic';

// 设置 Vercel 函数的最大执行时间 (秒)
// 注意：Hobby 免费版硬限制通常是 10s-60s，即便这里写 300 也可能被切断。
// 所以下面的“心跳机制”才是真正的保命符。
export const maxDuration = 60; 

export async function POST(req: NextRequest) {
  try {
    // 1. 解析前端提交的数据
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const prompt = formData.get('prompt') as string || '';
    const userId = formData.get('userId') as string || 'anonymous';

    // 2. 准备 Dify 需要的参数
    let uploadedFileId = null;

    // --- A. 如果有文件，先上传到 Dify (这步通常很快，不需要流式) ---
    if (file) {
      console.log(`[Upload] Starting upload for ${file.name}...`);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('user', userId);

      const uploadRes = await fetch(`${process.env.DIFY_API_URL}/v1/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        },
        body: uploadFormData,
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Dify Upload Failed: ${uploadRes.status} - ${errorText}`);
      }

      const uploadJson = await uploadRes.json();
      uploadedFileId = uploadJson.id;
      console.log(`[Upload] Success, File ID: ${uploadedFileId}`);
    }

    // --- B. 构建核心流式响应 (Heartbeat Stream) ---
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        // 定义心跳定时器
        let heartbeatInterval: NodeJS.Timeout | null = null;

        try {
          // 1. 【关键】立即发送一个初始字节，建立连接，防止 TTFB 超时
          // SSE 格式：以冒号开头的行是注释，浏览器会忽略，但能保活连接
          controller.enqueue(encoder.encode(": start-stream\n\n"));
          
          // 2. 启动心跳：每 10 秒发送一次保活信号
          heartbeatInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              console.log('[Stream] Sent heartbeat');
            } catch (err) {
              // 如果连接已关闭，停止心跳
              if (heartbeatInterval) clearInterval(heartbeatInterval);
            }
          }, 10000); // 10秒一次，安全起见

          // 3. 构建 Dify 工作流请求 Payload
          const workflowInputs: any = {
             // 根据你的 Dify 编排定义 inputs key
             // 如果你的 Start 节点接受 image/text 变量，请在这里调整
             "text_input": prompt, 
          };

          // 如果有文件，挂载到 files 字段 (Dify 官方格式)
          const filesPayload = uploadedFileId ? [
            {
              type: 'image', // 假设是图片，如果是 PDF 请改为 'document' 或根据 mimetype 判断
              transfer_method: 'local_file',
              upload_file_id: uploadedFileId
            }
          ] : [];

          // 4. 发起 Dify Workflow 请求
          console.log('[Workflow] Calling Dify...');
          const difyRes = await fetch(`${process.env.DIFY_API_URL}/v1/workflows/run`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: workflowInputs,
              files: filesPayload,
              response_mode: 'streaming',
              user: userId,
            }),
          });

          if (!difyRes.ok) {
            throw new Error(`Dify Workflow Error: ${difyRes.status}`);
          }

          if (!difyRes.body) {
            throw new Error("No body in Dify response");
          }

          // 5. 对接 Dify 的流
          const reader = difyRes.body.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 将 Dify 返回的真实数据转发给前端
            // Dify 也是返回 SSE 格式 (data: {...})，直接透传即可
            controller.enqueue(value);
          }

        } catch (error: any) {
          console.error("[Stream Error]", error);
          // 发送 SSE 格式的错误信息给前端
          const errorData = JSON.stringify({ event: 'error', message: error.message });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        } finally {
          // 清理工作
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          controller.close();
          console.log('[Stream] Closed');
        }
      }
    });

    // 返回流式响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("[API Error]", error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}