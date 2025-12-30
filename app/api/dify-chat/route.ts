import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { 
  calculateActualCost, 
  ModelType, 
  MODEL_COSTS,
  LUXURY_THRESHOLD,
  getModelDisplayName
} from "@/lib/pricing"

export const runtime = "edge"
export const maxDuration = 60
export const dynamic = "force-dynamic"

// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"
const DEFAULT_DIFY_KEY = process.env.DIFY_API_KEY 

// Supabase 客户端（用于扣费）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // 🔐 从 header 获取用户身份（middleware 已验证）
    const headerUserId = request.headers.get("X-User-Id")
    
    const body = await request.json()
    const { query, conversation_id, fileIds, userId: bodyUserId, inputs, model } = body
    
    // 优先使用 header 中的 userId（更安全），其次使用 body 中的
    const userId = headerUserId || bodyUserId
    
    // 🔐 二次验证：确保有用户身份
    if (!userId) {
      console.warn("🚫 [Dify-Chat] 未授权访问被拦截")
      return new Response(JSON.stringify({ error: "未授权访问，请先登录" }), { status: 401 })
    }

    console.log(`🔄 [切换模型] 用户: ${userId} | 目标模型: ${model || "默认标准版"} | conversation_id: ${conversation_id || "新会话"}`)

    // --- 1. 钥匙分发中心 (彻底分离通道) ---
    let targetApiKey = DEFAULT_DIFY_KEY; // 默认给标准版
    let keySource = "DEFAULT_DIFY_KEY";

    // 根据前端传来的暗号，分发不同的钥匙
    switch (model) {
        case "teaching-pro":
            targetApiKey = process.env.DIFY_TEACHING_PRO_API_KEY;
            keySource = "DIFY_TEACHING_PRO_API_KEY";
            break;
        case "gpt-5":
            targetApiKey = process.env.DIFY_API_KEY_GPT5;
            keySource = "DIFY_API_KEY_GPT5";
            break;
        case "claude-opus":
            targetApiKey = process.env.DIFY_API_KEY_CLAUDE;
            keySource = "DIFY_API_KEY_CLAUDE";
            break;
        case "gemini-pro":
            targetApiKey = process.env.DIFY_API_KEY_GEMINI;
            keySource = "DIFY_API_KEY_GEMINI";
            break;
        // 如果是 Banana/Sono/Sora 可以在这里继续加 case
        default:
            // 如果没传 model 或者 model 是 standard，就用上面的默认 Key
            break;
    }

    console.log(`🔑 [API Key] 使用: ${keySource} | 前缀: ${targetApiKey?.substring(0, 10)}...`)

    // 安全检查：防止忘配 Key
    if (!targetApiKey) {
        console.error(`❌ 严重错误: 模型 ${model} 的 API Key 未配置！环境变量 ${keySource} 为空`);
        return new Response(JSON.stringify({ error: `Server Error: Key for ${model} missing` }), { status: 500 });
    }

    // --- 2. 获取用户积分（用于预检查） ---
    const modelType = (model || "standard") as ModelType
    
    // 🔍 详细日志：查询用户积分
    console.log(`🔍 [积分查询] 开始查询用户: ${userId}`)
    
    // 🔥 修复：只查询存在的字段 credits 和 user_id（移除不存在的 total_spent）
    let { data: userCredits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("credits, user_id")
      .eq("user_id", userId)
      .single()
    
    // 🔥 关键修复：如果用户不存在，先创建积分记录（赠送 1000 积分，与注册逻辑一致）
    // 🔥 移除 total_spent 字段（数据库中不存在）
    if (creditsError?.code === "PGRST116") {
      console.log(`🆕 [新用户] 用户 ${userId} 在 user_credits 表中不存在，自动创建积分记录，赠送 1000 积分`)
      
      const { data: newCredits, error: insertError } = await supabaseAdmin
        .from("user_credits")
        .insert({ user_id: userId, credits: 1000, is_pro: false })
        .select()
        .single()
      
      if (insertError) {
        console.error(`❌ [新用户] 创建积分记录失败:`, insertError)
        // 尝试 upsert
        const { data: upsertData, error: upsertError } = await supabaseAdmin
          .from("user_credits")
          .upsert({ user_id: userId, credits: 1000, is_pro: false })
          .select()
          .single()
        
        if (upsertError) {
          console.error(`❌ [新用户] Upsert 也失败:`, upsertError)
        } else {
          userCredits = upsertData
          creditsError = null
          console.log(`✅ [新用户] Upsert 成功，赠送 1000 积分:`, upsertData)
        }
      } else {
        userCredits = newCredits
        creditsError = null
        console.log(`✅ [新用户] 积分记录创建成功，赠送 1000 积分:`, newCredits)
      }
    } else if (creditsError) {
      console.error(`❌ [积分查询] 查询失败:`, creditsError)
      console.log(`📋 [调试] 错误代码: ${creditsError.code}, 错误信息: ${creditsError.message}`)
    } else {
      console.log(`✅ [积分查询] 成功: user_id=${userCredits?.user_id}, credits=${userCredits?.credits}`)
    }
    
    const currentCredits = userCredits?.credits || 0
    
    // 预估最低消费（用于预检查）
    const estimatedMinCost = 5  // 最低 5 积分
    
    if (currentCredits < estimatedMinCost) {
      console.warn(`🚫 [计费] 用户 ${userId} 积分不足: 当前 ${currentCredits}`)
      return new Response(
        JSON.stringify({ error: "积分不足", required: estimatedMinCost, current: currentCredits }), 
        { status: 402 }
      )
    }
    
    console.log(`💰 [预检查] 用户: ${userId} | 模型: ${modelType} | 当前积分: ${currentCredits}`)

    // --- 3. 构造 Dify 请求函数 ---
    const callDify = async (retryWithoutId = false) => {
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
                Authorization: `Bearer ${targetApiKey}`, 
            },
            body: JSON.stringify(difyRequest),
        })

        return response;
    };

    // --- 4. 执行请求与智能容错 ---
    let response = await callDify(false);

    if (response.status === 404 || response.status === 400) {
        console.warn(`⚠️ 会话 ID 冲突 (可能切换了模型)，自动开启新会话重试...`);
        response = await callDify(true);
    }

    if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Dify API 最终报错 (${model}):`, errorText)
        return new Response(JSON.stringify({ error: `Dify Error: ${errorText}` }), { status: response.status })
    }

    // --- 5. 流式响应 + 静默扣费 ---
    // 创建一个 TransformStream 来处理流式数据并在结束时扣费
    let totalTokens = 0
    let conversationId = ""
    
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // 直接传递数据给前端
        controller.enqueue(chunk)
        
        // 解析 chunk 提取 token 信息
        try {
          const text = new TextDecoder().decode(chunk)
          const lines = text.split("\n")
          
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            
            try {
              const json = JSON.parse(data)
              
              // 提取 conversation_id
              if (json.conversation_id) {
                conversationId = json.conversation_id
              }
              
              // 提取 token 使用量（Dify 在 message_end 事件中返回）
              if (json.event === "message_end" && json.metadata?.usage) {
                totalTokens = json.metadata.usage.total_tokens || 0
                console.log(`📊 [Token统计] 总Token: ${totalTokens}`)
              }
            } catch {}
          }
        } catch {}
      },
      
      async flush(controller) {
        // 流结束时执行静默扣费
        try {
          // 计算实际费用
          const actualCost = calculateActualCost(modelType, { totalTokens })
          
          // 🔥 修复：只查询存在的字段 credits（移除 total_spent）
          const { data: latestCredits } = await supabaseAdmin
            .from("user_credits")
            .select("credits")
            .eq("user_id", userId)
            .single()
          
          const newCredits = (latestCredits?.credits || 0) - actualCost
          
          // 🔥 修复：只更新存在的字段 credits（移除 total_spent 和 updated_at）
          const { error: updateError } = await supabaseAdmin
            .from("user_credits")
            .update({ 
              credits: Math.max(newCredits, 0)  // 防止负数
            })
            .eq("user_id", userId)
          
          if (updateError) {
            console.error(`❌ [静默扣费失败] 用户 ${userId}:`, updateError)
          } else {
            console.log(`✅ [静默扣费成功] 用户 ${userId}: ${latestCredits?.credits} - ${actualCost} = ${newCredits} | Token: ${totalTokens}`)
            
            // 记录交易流水（可选，如果 credit_transactions 表存在）
            try {
              await supabaseAdmin.from("credit_transactions").insert({
                user_id: userId,
                amount: -actualCost,
                type: "ai_chat",
                description: `使用 ${getModelDisplayName(modelType)} 对话 (${totalTokens} tokens)`
              })
            } catch (txError) {
              console.warn(`⚠️ [交易记录] 写入失败（可忽略）:`, txError)
            }
          }
        } catch (e) {
          console.error(`❌ [静默扣费异常]:`, e)
        }
      }
    })

    // 返回经过 transform 处理的流
    return new Response(response.body?.pipeThrough(transformStream), {
        headers: { "Content-Type": "text/event-stream" },
    })

  } catch (error: any) {
    console.error("❌ 后端致命错误:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
