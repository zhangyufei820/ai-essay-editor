import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { 
  calculateActualCost, 
  ModelType, 
  MODEL_COSTS,
  LUXURY_THRESHOLD,
  getModelDisplayName
} from "@/lib/pricing"
import { uploadToCos } from "@/lib/cos"

export const runtime = "nodejs"
// 🔥 增加超时时间到 300 秒（5分钟），支持长文本生成
export const maxDuration = 300
export const dynamic = "force-dynamic"

// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"
// 🔥 作文批改（standard）使用专用的 ESSAY_CORRECTION_API_KEY
const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY 

// Supabase 客户端（用于扣费）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 🔥 验证AI响应是否为有效的作文批改结果
 * 如果AI没有识别到文档内容，返回的是废话/提示语，则不应该扣费
 * 
 * @param responseText AI返回的完整文本
 * @param modelType 使用的模型类型
 * @returns true = 有效响应，应该扣费；false = 无效响应，不扣费
 */
function validateEssayCorrectionResponse(responseText: string, modelType: ModelType): boolean {
  // 如果响应为空或太短，不扣费
  if (!responseText || responseText.length < 100) {
    console.log(`⚠️ [验证] 响应内容过短 (${responseText?.length || 0} 字符)，不扣费`)
    return false
  }
  
  // 🔥 检测无效响应的关键词（AI没有识别到文档时的常见回复）
  const invalidPatterns = [
    /没有.*?提供.*?文本/i,
    /没有.*?识别.*?内容/i,
    /无法.*?识别.*?文档/i,
    /请.*?提供.*?作文/i,
    /请.*?上传.*?文档/i,
    /没有.*?收到.*?作文/i,
    /未.*?检测到.*?内容/i,
    /没有.*?找到.*?文本/i,
    /请.*?输入.*?作文/i,
    /无法.*?读取.*?文件/i,
    /文档.*?为空/i,
    /内容.*?为空/i,
    /没有.*?文字/i,
    /图片.*?无法.*?识别/i,
    /OCR.*?失败/i,
    /不显示.*?提供.*?文本/i,
    // 🔥 新增：检测"评分全为0"的无效响应
    /您尚未提供.*?作文/i,
    /尚未提供.*?内容/i,
    /无法评价/i,
    /无法统计/i,
    /无法进行.*?分析/i,
    /无法判定/i,
    /未提供.*?作文/i,
    /未提供.*?内容/i,
    /需要.*?作文.*?文本/i,
    /缺少.*?作文/i,
  ]
  
  // 检查是否匹配无效模式
  for (const pattern of invalidPatterns) {
    if (pattern.test(responseText)) {
      console.log(`⚠️ [验证] 检测到无效响应模式: ${pattern}`)
      return false
    }
  }
  
  // 🔥 新增：检测"综合总分为0"的情况
  // 匹配类似 "综合总分 100% 0" 或 "得分 0" 的模式
  const zeroScorePatterns = [
    /综合总分.*?100%.*?0[^\d]/,
    /综合.*?得分.*?[：:]\s*0[^\d]/,
    /总分.*?[：:]\s*0[^\d]/,
    /等级判定.*?无法判定/,
  ]
  
  let zeroScoreCount = 0
  for (const pattern of zeroScorePatterns) {
    if (pattern.test(responseText)) {
      zeroScoreCount++
    }
  }
  
  // 如果检测到多个"0分"指标，说明是无效响应
  if (zeroScoreCount >= 2) {
    console.log(`⚠️ [验证] 检测到评分全为0的无效响应 (${zeroScoreCount}个0分指标)`)
    return false
  }
  
  // 🔥 检测有效响应的关键词（作文批改应该包含的内容）
  const validIndicators = [
    /批改/,
    /评分/,
    /得分/,
    /分数/,
    /优点/,
    /缺点/,
    /建议/,
    /修改/,
    /润色/,
    /原文/,
    /总评/,
    /点评/,
    /结构/,
    /语言/,
    /内容/,
    /主题/,
    /开头/,
    /结尾/,
    /段落/,
  ]
  
  // 至少要匹配3个有效指标才认为是有效的批改结果
  let validCount = 0
  for (const indicator of validIndicators) {
    if (indicator.test(responseText)) {
      validCount++
    }
  }
  
  if (validCount < 3) {
    console.log(`⚠️ [验证] 有效指标不足 (${validCount}/3)，可能不是有效的批改结果`)
    return false
  }
  
  // 🔥 新增：检查是否有实际的分数（非0分）
  // 匹配类似 "得分 15" 或 "分数：18" 的模式
  const hasRealScore = /得分.*?[1-9]\d*|分数.*?[1-9]\d*|[1-9]\d*\s*分/.test(responseText)
  
  if (!hasRealScore) {
    console.log(`⚠️ [验证] 未检测到有效分数，可能是无效批改`)
    return false
  }
  
  console.log(`✅ [验证] 响应有效，包含 ${validCount} 个批改指标，且有实际分数`)
  return true
}

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
        case "banana-2-pro":
            targetApiKey = process.env.DIFY_BANANA_API_KEY;
            keySource = "DIFY_BANANA_API_KEY";
            break;
        // 如果是 Sono/Sora 可以在这里继续加 case
        default:
            // 如果没传 model 或者 model 是 standard，就用上面的默认 Key
            break;
    }

    console.log(`🔑 [API Key] 使用: ${keySource} | 前缀: ${targetApiKey?.substring(0, 10)}...`)

    // 安全检查：防止忘配 Key
    if (!targetApiKey) {
        console.error(`❌ 严重错误: 模型 ${model} 的 API Key 未配置！环境变量 ${keySource} 为空`);
        return new Response(JSON.stringify({ 
          error: `配置错误：${model} 模型的 API Key 未设置`,
          details: `请在 Vercel 环境变量中配置 ${keySource}`
        }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
    }
    
    // 🔥 Banana 专用调试日志
    if (model === "banana-2-pro") {
      console.log(`🎨 [Banana Debug] 请求详情:`)
      console.log(`  - 用户ID: ${userId}`)
      console.log(`  - 查询内容: ${query?.slice(0, 100)}`)
      console.log(`  - 文件数量: ${fileIds?.length || 0}`)
      console.log(`  - Conversation ID: ${conversation_id || "新会话"}`)
      console.log(`  - API Key: ${targetApiKey}`)
      console.log(`  - Base URL: ${DIFY_BASE_URL}`)
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
    console.log(`🚀 [Dify请求] 开始调用 Dify API...`)
    let response = await callDify(false);
    
    console.log(`📡 [Dify响应] 状态码: ${response.status}`)
    
    if (model === "banana-2-pro") {
      console.log(`🎨 [Banana] Dify响应头:`, Object.fromEntries(response.headers.entries()))
    }

    if (response.status === 404 || response.status === 400) {
        console.warn(`⚠️ 会话 ID 冲突 (可能切换了模型)，自动开启新会话重试...`);
        response = await callDify(true);
        console.log(`📡 [Dify重试] 新状态码: ${response.status}`)
    }

    if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Dify API 最终报错 (${model}):`, errorText)
        
        // 🔥 Banana 特殊错误处理
        if (model === "banana-2-pro") {
          console.error(`🎨 [Banana错误] 完整错误信息:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            apiKey: targetApiKey?.substring(0, 20) + '...',
            baseUrl: DIFY_BASE_URL
          })
        }
        
        return new Response(JSON.stringify({ error: `Dify Error: ${errorText}` }), { status: response.status })
    }
    
    console.log(`✅ [Dify请求] 成功，开始流式传输...`)

    // --- 5. 流式响应 + 智能扣费 + Banana 图片转存 ---
    // 创建一个 TransformStream 来处理流式数据并在结束时扣费
    let totalTokens = 0
    let conversationId = ""
    let fullResponseText = ""  // 🔥 收集完整响应内容用于验证
    let bananaImageUrls: string[] = []  // 🎨 收集 Banana 生成的图片 URL
    
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // 直接传递数据给前端
        controller.enqueue(chunk)
        
        // 解析 chunk 提取 token 信息
        try {
          const text = new TextDecoder().decode(chunk)
          const lines = text.split("\n")
          
          // 🎨 Banana 调试：记录原始数据
          if (model === "banana-2-pro" && text.trim()) {
            console.log(`🎨 [Banana流式] 收到数据块:`, text.substring(0, 200))
          }
          
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            
            try {
              const json = JSON.parse(data)
              
              // 🎨 Banana 调试：记录所有事件
              if (model === "banana-2-pro") {
                console.log(`🎨 [Banana事件] ${json.event}:`, JSON.stringify(json).substring(0, 300))
              }
              
              // 提取 conversation_id
              if (json.conversation_id) {
                conversationId = json.conversation_id
              }
              
              // 🔥 收集响应文本内容
              if (json.event === "message" && json.answer) {
                fullResponseText += json.answer
                
                // 🎨 Banana 图片检测：提取图片 URL
                if (model === "banana-2-pro") {
                  // 匹配 Markdown 图片格式：![alt](url)
                  const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g
                  const matches = json.answer.matchAll(imageRegex)
                  for (const match of matches) {
                    const imageUrl = match[1]
                    if (!bananaImageUrls.includes(imageUrl)) {
                      bananaImageUrls.push(imageUrl)
                      console.log(`🎨 [Banana] 检测到图片 URL (message): ${imageUrl}`)
                    }
                  }
                }
              }
              
              // 🎨 处理 message_file 事件（图片文件）
              if (json.event === "message_file" && model === "banana-2-pro") {
                console.log(`🎨 [Banana] 收到 message_file 事件:`, JSON.stringify(json))
                
                // Dify 返回的图片文件格式：{ type: "image", url: "..." }
                if (json.type === "image" && json.url) {
                  const imageUrl = json.url
                  if (!bananaImageUrls.includes(imageUrl)) {
                    bananaImageUrls.push(imageUrl)
                    console.log(`🎨 [Banana] 检测到图片 URL (message_file): ${imageUrl}`)
                    
                    // 🔥 立即将图片 URL 以 Markdown 格式添加到响应中
                    fullResponseText += `\n\n![Generated Image](${imageUrl})`
                  }
                }
              }
              
              // 🎨 处理 workflow_finished 事件（可能包含图片）
              if (json.event === "workflow_finished" && model === "banana-2-pro") {
                console.log(`🎨 [Banana] 收到 workflow_finished 事件:`, JSON.stringify(json))
                
                // 检查是否有输出文件
                if (json.outputs && json.outputs.files) {
                  for (const file of json.outputs.files) {
                    if (file.type === "image" && file.url) {
                      const imageUrl = file.url
                      if (!bananaImageUrls.includes(imageUrl)) {
                        bananaImageUrls.push(imageUrl)
                        console.log(`🎨 [Banana] 检测到图片 URL (workflow_finished): ${imageUrl}`)
                        
                        // 🔥 立即将图片 URL 以 Markdown 格式添加到响应中
                        fullResponseText += `\n\n![Generated Image](${imageUrl})`
                      }
                    }
                  }
                }
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
        // 🎨 Banana 图片转存到 COS（在扣费之前执行，确保图片已保存）
        if (model === "banana-2-pro" && bananaImageUrls.length > 0) {
          console.log(`🎨 [Banana COS] 开始转存 ${bananaImageUrls.length} 张图片到 COS...`)
          
          for (const imageUrl of bananaImageUrls) {
            try {
              console.log(`🎨 [Banana COS] 转存图片: ${imageUrl}`)
              const result = await uploadToCos(imageUrl, 'banana', 'png')
              
              if (result.success && result.cdnUrl) {
                console.log(`✅ [Banana COS] 转存成功: ${result.cdnUrl}`)
                // 🔥 替换响应文本中的图片 URL 为 CDN URL
                fullResponseText = fullResponseText.replace(imageUrl, result.cdnUrl)
              } else {
                console.warn(`⚠️ [Banana COS] 转存失败: ${result.error}`)
              }
            } catch (err) {
              console.error(`❌ [Banana COS] 转存异常:`, err)
            }
          }
          
          console.log(`✅ [Banana COS] 图片转存完成，已替换为 CDN URL`)
        }
        
        // 流结束时执行智能扣费
        try {
          // 🔥 基础验证：响应内容不能为空
          if (!fullResponseText || fullResponseText.trim().length === 0) {
            console.warn(`⚠️ [智能扣费] 响应内容为空，跳过扣费 | 用户: ${userId}`)
            return
          }
          
          console.log(`💰 [扣费] 准备扣费 | 用户: ${userId} | 模型: ${modelType} | 响应长度: ${fullResponseText.length} 字符`)
          
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
            
            // 🔥 记录交易流水（重要：用于使用记录展示）
            const { error: txError } = await supabaseAdmin.from("credit_transactions").insert({
              user_id: userId,
              amount: -actualCost,
              type: "consume",
              description: `使用 ${getModelDisplayName(modelType)} 对话 (${totalTokens} tokens)`,
              balance_before: latestCredits?.credits || 0,
              balance_after: newCredits
            })
            
            if (txError) {
              console.error(`❌ [交易记录] 写入失败:`, txError.message, txError.code)
              // 🔥 如果是表不存在错误，尝试创建表
              if (txError.code === '42P01') {
                console.error(`❌ [交易记录] credit_transactions 表不存在！请在 Supabase 中执行 scripts/011_create_credit_transactions.sql`)
              }
            } else {
              console.log(`✅ [交易记录] 写入成功: 用户 ${userId} 消耗 ${actualCost} 积分`)
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
