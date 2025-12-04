import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "edge"
export const maxDuration = 60

// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"
const DEFAULT_DIFY_KEY = process.env.DIFY_API_KEY 

// 🚨 关键修改 1：暂时将费用设为 0，防止报 402 错误
const COST_ESSAY = 250 
const COST_CHAT = 20  

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, conversation_id, fileIds, userId, inputs, model } = body

    console.log(`🔄 [切换模型] 用户: ${userId || "访客"} | 目标模型: ${model || "默认标准版"}`)

    // --- 1. 钥匙分发中心 (彻底分离通道) ---
    let targetApiKey = DEFAULT_DIFY_KEY; // 默认给标准版

    // 根据前端传来的暗号，分发不同的钥匙
    switch (model) {
        case "gpt-5":
            targetApiKey = process.env.DIFY_API_KEY_GPT5;
            break;
        case "claude-opus":
            targetApiKey = process.env.DIFY_API_KEY_CLAUDE;
            break;
        case "gemini-pro":
            targetApiKey = process.env.DIFY_API_KEY_GEMINI;
            break;
        // 如果是 Banana/Sono/Sora 可以在这里继续加 case
        default:
            // 如果没传 model 或者 model 是 standard，就用上面的默认 Key
            break;
    }

    // 安全检查：防止忘配 Key
    if (!targetApiKey) {
        console.error(`❌ 严重错误: 模型 ${model} 的 API Key 未配置！`);
        return new Response(JSON.stringify({ error: `Server Error: Key for ${model} missing` }), { status: 500 });
    }

    // --- 2. 计费模块 (目前已设为免费，畅通无阻) ---
    // 为了防止逻辑干扰，这里只保留最基础的检查，不再拦截
    if (userId) {
       // 这里原本是扣费逻辑，现在 COST 是 0，所以会直接通过
       // console.log("本轮免费测试，不扣积分");
    }

    // --- 3. 构造 Dify 请求函数 ---
    // 封装成函数，方便出错时重试
    const callDify = async (retryWithoutId = false) => {
        
        // 如果是重试模式，或者是切换模型后的第一次请求，为了安全，我们可以强制新开会话
        // 但为了保留上下文，我们先尝试带 ID，如果报错再重试
        const currentConvId = retryWithoutId ? null : conversation_id;

        const difyRequest: any = {
            inputs: inputs || {},
            query: query || "你好",
            response_mode: "streaming",
            user: userId || "default-user",
            conversation_id: currentConvId,
        }

        if (fileIds && fileIds.length > 0) {
            difyRequest.files = fileIds.map((id: string) => ({
                type: 'image',
                transfer_method: 'local_file',
                upload_file_id: id
            }));
        }

        const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // ⚠️ 使用刚才选好的特定钥匙
                Authorization: `Bearer ${targetApiKey}`, 
            },
            body: JSON.stringify(difyRequest),
        })

        return response;
    };

    // --- 4. 执行请求与智能容错 ---
    let response = await callDify(false);

    // 🚨 关键修改 2：智能处理会话冲突
    // 如果 Dify 返回 404 (Conversation Not Found) 或 400 (Parameters Error 往往是因为 ID 不属于该 App)
    // 说明前端传来的 conversation_id 是旧模型的，新模型不认识。
    // 这时候我们自动丢弃 ID，重新发起一次“新会话”请求。
    if (response.status === 404 || response.status === 400) {
        console.warn(`⚠️ 会话 ID 冲突 (可能切换了模型)，自动开启新会话重试...`);
        response = await callDify(true); // 传入 true，强制清除 ID 重试
    }

    // 如果还是错，那就真报错了
    if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Dify API 最终报错 (${model}):`, errorText)
        return new Response(JSON.stringify({ error: `Dify Error: ${errorText}` }), { status: response.status })
    }

    // 成功连接，建立流式管道
    return new Response(response.body, {
        headers: { "Content-Type": "text/event-stream" },
    })

  } catch (error: any) {
    console.error("❌ 后端致命错误:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}