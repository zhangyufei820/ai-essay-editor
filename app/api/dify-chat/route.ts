import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  DifyChatRequest,
  DifyWorkflowRequest,
  DifyImageObject,
  DifyFileObject,
  DifyWorkflowInputs,
  DifyImageSize,
} from "@/lib/dify-types"
import {
  calculateActualCost,
  ModelType,
  MODEL_COSTS,
  LUXURY_THRESHOLD,
  getModelDisplayName
} from "@/lib/pricing"

export const runtime = "nodejs"
// 🔥 增加超时时间到 300 秒（5分钟），支持长文本生成
export const maxDuration = 300
export const dynamic = "force-dynamic"

// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1"
// 🔥 作文批改（standard）使用专用的 ESSAY_CORRECTION_API_KEY
const DEFAULT_DIFY_KEY = process.env.ESSAY_CORRECTION_API_KEY || process.env.DIFY_API_KEY 

// Supabase 客户端工厂函数（延迟创建避免构建时错误）
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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
    const { query, conversation_id, fileIds, userId: bodyUserId, inputs, model, imageSize, estimatedCost } = body

    // 🔥 会话隔离修复：为每个模型创建独立的 conversation_id 命名空间
    // 防止多用户并发时不同模型复用同一个 conversation_id 导致 Dify 404 冲突
    // 每个模型的 conversation_id 前缀为 "model_name:"，Dify 端可剥离前缀处理
    const modelPrefix = model || "standard"
    let effectiveConvId = conversation_id
    if (conversation_id && !conversation_id.startsWith(`${modelPrefix}:`)) {
      // 检测到 conversation_id 来自不同模型（无当前模型前缀），说明发生了模型切换
      // 为防止会话冲突，清除旧的 conversation_id，强制创建新会话
      console.warn(`⚠️ [会话隔离] 检测到模型切换，conversation_id="${conversation_id}" 不属于当前模型 "${modelPrefix}"，强制创建新会话`)
      effectiveConvId = null
    } else if (conversation_id && conversation_id.startsWith(`${modelPrefix}:`)) {
      // 当前模型前缀，剥离后发送给 Dify
      effectiveConvId = conversation_id.slice((modelPrefix + ":").length)
    }
    
    // 🔥 调试：打印完整请求体
    console.log(`🔍 [请求体] 完整内容:`, JSON.stringify(body, null, 2))
    console.log(`🔍 [query字段] 值: "${query}" | 类型: ${typeof query} | 长度: ${query?.length || 0}`)
    
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
        case "grok-4.2":
            targetApiKey = process.env.DIFY_API_KEY_GROK42;
            keySource = "DIFY_API_KEY_GROK42";
            break;
        case "open-claw":
            targetApiKey = process.env.DIFY_API_KEY_OPENCLAW;
            keySource = "DIFY_API_KEY_OPENCLAW";
            break;
        case "quanquan-math":
            targetApiKey = process.env.DIFY_QUANQUANMATH_API_KEY;
            keySource = "DIFY_QUANQUANMATH_API_KEY";
            break;
        case "quanquan-english":
            targetApiKey = process.env.DIFY_QUANQUANENGLISH_API_KEY;
            keySource = "DIFY_QUANQUANENGLISH_API_KEY";
            break;
        case "beike-pro":
            targetApiKey = process.env.DIFY_BEIKE_PRO_API_KEY;
            keySource = "DIFY_BEIKE_PRO_API_KEY";
            break;
        case "banzhuren":
            targetApiKey = process.env.DIFY_BANZHUREN_API_KEY;
            keySource = "DIFY_BANZHUREN_API_KEY";
            break;
        case "ai-writing-paper":
            targetApiKey = process.env.DIFY_AI_WRITING_PAPER_API_KEY;
            keySource = "DIFY_AI_WRITING_PAPER_API_KEY";
            break;
        case "zhongying-essay":
        case "reading-report":
        case "experiment-report":
        case "study-abroad":
        case "resume-optimize":
        case "speech-defense":
        case "school-wechat":
            targetApiKey = process.env.DIFY_AI_WRITING_PAPER_API_KEY;
            keySource = "DIFY_AI_WRITING_PAPER_API_KEY";
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
    let { data: userCredits, error: creditsError } = await getSupabaseAdmin()
      .from("user_credits")
      .select("credits, user_id")
      .eq("user_id", userId)
      .single()
    
    // 🔥 关键修复：如果用户不存在，先创建积分记录（赠送 1000 积分，与注册逻辑一致）
    // 🔥 移除 total_spent 字段（数据库中不存在）
    if (creditsError?.code === "PGRST116") {
      console.log(`🆕 [新用户] 用户 ${userId} 在 user_credits 表中不存在，自动创建积分记录，赠送 1000 积分`)
      
      const { data: newCredits, error: insertError } = await getSupabaseAdmin()
        .from("user_credits")
        .insert({ user_id: userId, credits: 1000, is_pro: false })
        .select()
        .single()
      
      if (insertError) {
        console.error(`❌ [新用户] 创建积分记录失败:`, insertError)
        // 尝试 upsert
        const { data: upsertData, error: upsertError } = await getSupabaseAdmin()
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
    // 🔥 共享流状态：首字节探测 + 超时定时器（供 callDify 和 transformStream 共同访问）
    const streamStatus: {
      firstByteReceived: boolean
      timeoutId: ReturnType<typeof setTimeout> | null
      controller: AbortController | null
    } = { firstByteReceived: false, timeoutId: null, controller: null }

    const callDify = async (retryWithoutId = false) => {
        const currentConvId = retryWithoutId ? null : conversation_id;

        // 🎨 Banana 2 Pro 使用 Workflow API，其他模型使用 Chat API
        const isWorkflow = model === "banana-2-pro";
        const apiEndpoint = isWorkflow ? "/workflows/run" : "/chat-messages";

        let difyRequest: DifyWorkflowRequest | DifyChatRequest;

        if (isWorkflow) {
            // 🎨 Workflow API 格式
            // 🔥 关键修复：init_image 需要是文件对象格式，而不是简单的文件ID字符串
            difyRequest = {
                inputs: {
                    image_prompt: query || "",  // ✅ 文本提示词
                    ...(inputs || {})           // 保留其他可能的输入
                },
                response_mode: "streaming",
                user: userId || "default-user",
            }

            // 🔥 如果有文件，构造文件对象格式
            if (fileIds && fileIds.length > 0) {
                difyRequest.inputs.init_image = {
                    type: 'image',
                    transfer_method: 'local_file',
                    upload_file_id: fileIds[0]
                }
                console.log(`🎨 [Banana] 使用文件对象:`, difyRequest.inputs.init_image)
            }

            // 🎨 传递尺寸参数（如果有）
            if (imageSize) {
                difyRequest.inputs.aspect_ratio = imageSize.ratio || "9:16"
                difyRequest.inputs.image_width = imageSize.width || 1080
                difyRequest.inputs.image_height = imageSize.height || 1920
                console.log(`🎨 [Banana] 图片尺寸: ${imageSize.ratio} (${imageSize.width}x${imageSize.height})`)
            }

            console.log(`🎨 [Banana] Workflow 请求体:`, JSON.stringify(difyRequest, null, 2))
        } else {
            // 💬 Chat API 格式
            difyRequest = {
                inputs: inputs || {},
                query: query || "你好",
                response_mode: "streaming",
                user: userId || "default-user",
                conversation_id: effectiveConvId !== undefined ? effectiveConvId : currentConvId,
            }

            if (fileIds && fileIds.length > 0) {
                difyRequest.files = fileIds.map((id: string) => ({
                    type: 'image',
                    transfer_method: 'local_file',
                    upload_file_id: id
                }));
            }
        }

        console.log(`🔗 [API端点] ${apiEndpoint} | 模式: ${isWorkflow ? 'Workflow' : 'Chat'}`)

        // 🔥 180秒兜底超时 AbortController
        streamStatus.controller = new AbortController()
        streamStatus.timeoutId = setTimeout(() => {
            if (!streamStatus.firstByteReceived) {
                console.warn(`⏰ [Dify超时] 180秒内未收到首字节，中断请求`)
                streamStatus.controller?.abort()
            }
        }, 180_000)

        try {
            console.warn(`🚀 [Dify请求] 开始请求 Dify... model=${model} endpoint=${DIFY_BASE_URL}${apiEndpoint}`)
            const response = await fetch(`${DIFY_BASE_URL}${apiEndpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${targetApiKey}`,
                },
                body: JSON.stringify(difyRequest),
                signal: streamStatus.controller.signal,
            })
            console.warn(`✅ [Dify请求] 响应到达 status=${response.status} body=${response.body === null ? 'null' : 'ReadableStream'}`)

            return response
        } catch (error: unknown) {
            // 清理超时定时器
            if (streamStatus.timeoutId) {
                clearTimeout(streamStatus.timeoutId)
                streamStatus.timeoutId = null
            }

            // 判断是否为 AbortError（超时中断）
            const err = error instanceof Error ? error : null
            if (err && (err.name === 'AbortError' || err.message.includes('abort'))) {
                console.error(`❌ [Dify请求] 请求被中断（超时）:`, err.message)
                throw new Error('请求超时：Dify 服务在 180 秒内未响应')
            }

            throw error
        }
    };

    // --- 4. 执行请求与智能容错（最多重试1次，防止死循环）---
    const MAX_RETRIES = 1;
    let retryCount = 0;
    let response = null;

    console.warn(`🚀 [Dify请求] 开始调用 Dify API...`)

    while (retryCount <= MAX_RETRIES) {
        const isRetry = retryCount > 0;
        if (isRetry) {
            console.warn(`🔄 [Dify重试] 第 ${retryCount} 次重试 (isNewSession=true)`);
        }

        response = await callDify(isRetry);
        console.warn(`📡 [Dify响应] 状态码: ${response.status}`)
        console.warn(`📡 [Dify响应] body类型: ${typeof response.body} | body是否为null: ${response.body === null}`)

        if (model === "banana-2-pro") {
            console.log(`🎨 [Banana] Dify响应头:`, Object.fromEntries(response.headers.entries()))
        }

        // 只有首次失败才重试，重试后仍失败则退出循环
        if ((response.status === 404 || response.status === 400) && retryCount === 0) {
            retryCount++;
            console.warn(`⚠️ [会话隔离] 会话 ID 冲突 (模型=${modelPrefix})，自动开启新会话重试...`);
            // 强制清除 effectiveConvId，确保重试时创建全新会话
            effectiveConvId = null;
            continue;
        }

        // 非 404/400 错误，或已经是重试后的结果，直接跳出
        break;
    }

    // 防御：确保 response 已赋值
    if (!response) {
        return new Response(JSON.stringify({ error: "请求失败：无法获取响应" }), { status: 500 })
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
    let jsonBuffer = ""  // 🔥 JSON 行缓冲：跨 chunk 拼接不完整的 SSE 数据行

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // 🔥 首字节探测：当 transform 被调用时，说明流式数据已开始传输，取消 180s 超时
        if (!streamStatus.firstByteReceived) {
            streamStatus.firstByteReceived = true
            if (streamStatus.timeoutId) {
                clearTimeout(streamStatus.timeoutId)
                streamStatus.timeoutId = null
            }
            console.warn(`✅ [首字节探测] Dify 流式数据开始传输，已取消 180s 超时定时器`)
        }

        // 直接传递数据给前端
        controller.enqueue(chunk)

        // 解析 chunk 提取 token 信息
        try {
          const text = new TextDecoder().decode(chunk)

          // 🎨 Banana 调试：记录原始数据
          if (model === "banana-2-pro" && text.trim()) {
            console.log(`🎨 [Banana流式] 收到数据块:`, text.substring(0, 200))
          }

          // 🔥 追加到缓冲区，然后只处理完整的行
          // 完整的 SSE 数据行格式：data: {...}\n
          // 可能被 TCP 包分割成多块传输，需要跨 chunk 缓冲
          jsonBuffer += text

          // 按换行分割，处理所有完整的行
          const lines = jsonBuffer.split("\n")
          // 保留最后一行（可能是未完成的，等待下一个 chunk）
          jsonBuffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue

            // 🔥 JSON 完整性检查：确保 JSON 字符串完整（以 } 或 ] 结尾）
            // 如果不完整，说明 SSE 数据行被分割了，保留到缓冲区等待下一个 chunk
            const trimmed = data.trim()
            if (trimmed.length > 0 && !trimmed.endsWith("}") && !trimmed.endsWith("]")) {
              // JSON 不完整（被字节边界分割），放回缓冲区等待下一个 chunk
              jsonBuffer = line + "\n" + jsonBuffer
              continue
            }

            try {
              const json = JSON.parse(data)

              // 🎨 Banana 调试：记录所有事件
              if (model === "banana-2-pro") {
                console.log(`🎨 [Banana事件] ${json.event}:`, JSON.stringify(json).substring(0, 300))
              }

              // 🧠 记录工作流节点事件（用于前端思考过程显示）
              if (json.event === 'node_started' || json.event === 'node_finished') {
                console.log(`🧠 [工作流节点] ${json.event}: ${json.data?.title || json.title || '未知节点'}`)
              }

              // 提取 conversation_id
              if (json.conversation_id) {
                conversationId = json.conversation_id
              }

              // 🔥 收集响应文本内容（Chat API）
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

              // 🔥 收集 Workflow API 的文本响应（Banana 2 Pro）
              if (json.event === "text_chunk" || json.event === "agent_message") {
                const text = json.data?.text || json.text || ''
                if (text) {
                  fullResponseText += text
                  console.log(`🎨 [Workflow文本] 收集到文本: ${text.substring(0, 50)}...`)
                }
              }

              // 🔥 收集 Workflow 完成事件的输出文本
              if (json.event === "workflow_finished") {
                if (json.data?.outputs) {
                  const outputs = json.data.outputs
                  if (outputs.text) {
                    fullResponseText += outputs.text
                    console.log(`🎨 [Workflow完成] 收集到输出文本: ${outputs.text.substring(0, 50)}...`)
                  } else if (outputs.result) {
                    fullResponseText += outputs.result
                    console.log(`🎨 [Workflow完成] 收集到结果文本: ${outputs.result.substring(0, 50)}...`)
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
            } catch (e) {
              // 🔥 只有真正 JSON 格式错误才记录（而不是被截断的数据）
              if (e instanceof SyntaxError) {
                // JSON 仍然不完整，放回缓冲区
                jsonBuffer = line + "\n" + jsonBuffer
              } else {
                console.error(`❌ [Transform解析] 事件解析失败:`, e, `| 数据:`, data?.substring(0, 100))
              }
            }
          }
        } catch (e) {
          console.error(`❌ [Transform] transform阶段异常:`, e)
        }
      },

      async flush(controller) {
        // 🔥 处理缓冲区中剩余的未完成 JSON（流结束时的最后一条数据）
        if (jsonBuffer.trim().length > 0) {
          const line = jsonBuffer.trim()
          if (line.startsWith("data: ") && line !== "[DONE]") {
            const data = line.slice(6).trim()
            try {
              const json = JSON.parse(data)
              // 处理最后一条消息的文本收集
              if (json.event === "message" && json.answer) {
                fullResponseText += json.answer
              }
              if (json.conversation_id) {
                conversationId = json.conversation_id
              }
              if (json.metadata?.usage?.total_tokens) {
                totalTokens = json.metadata.usage.total_tokens
              }
            } catch (e) {
              // 流结束时的最后数据仍然不完整，静默忽略
              console.warn(`⚠️ [Flush] 缓冲区剩余数据解析失败:`, e)
            }
          }
        }

        // 流结束时执行智能扣费
      
      async flush(controller) {
        // 流结束时执行智能扣费
        console.warn(`🔥 [Flush] 流式响应结束，fullResponseText长度=${fullResponseText.length}，开始执行扣费逻辑`)
        try {
          // 🔥 检测是否生成了图像
          const hasGeneratedImage = bananaImageUrls.length > 0
          
          // 🔥 基础验证：响应内容不能为空（除非是 Banana 生成了图片）
          if (!hasGeneratedImage && (!fullResponseText || fullResponseText.trim().length === 0)) {
            console.warn(`⚠️ [智能扣费] 响应内容为空，跳过扣费 | 用户: ${userId}`)
            return
          }
          
          console.log(`💰 [扣费] 准备扣费 | 用户: ${userId} | 模型: ${modelType} | 响应长度: ${fullResponseText.length} 字符 | 图片数: ${bananaImageUrls.length} | 生成图像: ${hasGeneratedImage}`)
          
          // 🔥 计算实际费用（传递是否生成图像的标志）
          const actualCost = calculateActualCost(
            modelType, 
            { totalTokens },
            { hasGeneratedImage }  // 🔥 关键：传递图像生成标志
          )
          
          // 🔥 使用原子操作扣费，防止并发问题
          // 先查询当前积分，同时检查是否为有效数值
          const { data: latestCredits, error: queryError } = await getSupabaseAdmin()
            .from("user_credits")
            .select("credits")
            .eq("user_id", userId)
            .single()

          // 🔥 防御性检查：确保查询成功且 credits 是有效数值
          if (queryError) {
            console.error(`❌ [静默扣费] 查询用户积分失败 userId=${userId}:`, queryError)
            return
          }
          if (latestCredits?.credits === null || latestCredits?.credits === undefined) {
            console.error(`❌ [静默扣费] 用户积分数据异常 userId=${userId}, credits=${latestCredits?.credits}`)
            return
          }

          const currentCredits = latestCredits.credits
          const newCredits = currentCredits - actualCost

          // 🔥 使用条件更新：只有积分未变时才扣费，防止并发问题
          const updateResult = await getSupabaseAdmin()
            .from("user_credits")
            .update({
              credits: Math.max(newCredits, 0)  // 防止负数
            })
            .eq("user_id", userId)
            .eq("credits", currentCredits)  // 🔥 关键：只有在积分未变时才更新，防止并发扣费
            .select("credits")  // 🔥 获取更新后的值

          if (updateResult.error) {
            console.error(`❌ [静默扣费失败] 用户 ${userId}:`, updateResult.error)
          } else if (!updateResult.data || updateResult.data.length === 0) {
            // 🔥 更新未发生（积分已变化），可能是并发请求，跳过扣费
            console.warn(`⚠️ [静默扣费跳过] 用户 ${userId} 积分已在并发请求中更新，跳过本次扣费 | 当前积分: ${currentCredits}`)
          } else {
            const updatedCredits = updateResult.data[0]?.credits
            console.log(`✅ [静默扣费成功] 用户 ${userId}: ${currentCredits} - ${actualCost} = ${updatedCredits} | Token: ${totalTokens}`)
            
            // 🔥 记录交易流水（重要：用于使用记录展示）
            // 🔥 如果前端传来了 estimatedCost，优先��用前端的成本计算
            const displayTokens = totalTokens > 0 ? `${totalTokens} tokens` : (estimatedCost ? `${estimatedCost} 积分` : '0 tokens')
            
            const { error: txError } = await getSupabaseAdmin().from("credit_transactions").insert({
              user_id: userId,
              amount: -actualCost,
              type: "consume",
              description: `使用 ${getModelDisplayName(modelType)} 对话 (${displayTokens})`,
              balance_before: currentCredits,
              balance_after: updatedCredits
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
    const transformedBody = response.body?.pipeThrough(transformStream)
    if (!transformedBody) {
      console.error(`❌ [Stream错误] pipeThrough返回undefined! response.body=${response.body === null ? 'null' : 'not-null'}`)
      return new Response(JSON.stringify({ error: "Dify响应体为空，服务端流处理失败" }), { status: 502 })
    }
    console.warn(`✅ [Stream开始] 开始返回流式响应给前端，body locked: ${transformedBody.locked}`)
    return new Response(transformedBody, {
        headers: { "Content-Type": "text/event-stream" },
    })

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error("❌ 后端致命错误:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
