(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/[root-of-the-server]__5ce086d2._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/lib/pricing.ts [app-edge-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * 统一计费中心 v2.0
 * 
 * 计费规则：
 * - 智能体（standard, teaching-pro）：10 积分/1K Token
 * - 独立模型（gpt-5, claude-opus, gemini-pro 等）：20 积分/1K Token
 * - 多媒体模型：按次固定扣费（成本/0.4）
 * 
 * 扣费流程：
 * - 前端：显示"预计消耗"（基于估算 Token 数）
 * - 后端：等 Dify 回答完后根据实际 Token 数静默结算
 * 
 * 利润保障：
 * - 豪华会员 12,000 积分全额消耗时，VivaAPI 成本占比 ≤ 40%
 */ // ============================================
// 1. 类型定义
// ============================================
__turbopack_context__.s([
    "AGENT_TOKEN_RATE",
    ()=>AGENT_TOKEN_RATE,
    "DAILY_FREE_LIMIT",
    ()=>DAILY_FREE_LIMIT,
    "LUXURY_CREDITS",
    ()=>LUXURY_CREDITS,
    "LUXURY_THRESHOLD",
    ()=>LUXURY_THRESHOLD,
    "MODEL_COSTS",
    ()=>MODEL_COSTS,
    "PROFIT_MARGIN",
    ()=>PROFIT_MARGIN,
    "STANDALONE_TOKEN_RATE",
    ()=>STANDALONE_TOKEN_RATE,
    "calculateActualCost",
    ()=>calculateActualCost,
    "calculatePreviewCost",
    ()=>calculatePreviewCost,
    "getModelCategory",
    ()=>getModelCategory,
    "getModelDisplayName",
    ()=>getModelDisplayName,
    "getModelMode",
    ()=>getModelMode,
    "getTokenRate",
    ()=>getTokenRate,
    "validateProfitMargin",
    ()=>validateProfitMargin
]);
const AGENT_TOKEN_RATE = 10;
const STANDALONE_TOKEN_RATE = 20;
const PROFIT_MARGIN = 0.4;
const MODEL_COSTS = {
    // ========== 智能体（10 积分/1K Token）==========
    "standard": {
        category: "agent",
        tokenRate: AGENT_TOKEN_RATE,
        displayName: "作文批改智能体",
        mode: "text",
        estimatedTokens: 2000 // 预估平均 2K tokens
    },
    "teaching-pro": {
        category: "agent",
        tokenRate: AGENT_TOKEN_RATE,
        displayName: "教学评智能助手",
        mode: "text",
        estimatedTokens: 2500 // 预估平均 2.5K tokens
    },
    // ========== 独立模型（20 积分/1K Token）==========
    "gpt-5": {
        category: "standalone",
        tokenRate: STANDALONE_TOKEN_RATE,
        displayName: "ChatGPT 5.1",
        mode: "text",
        estimatedTokens: 1500 // 预估平均 1.5K tokens
    },
    "claude-opus": {
        category: "standalone",
        tokenRate: STANDALONE_TOKEN_RATE,
        displayName: "Claude Opus 4.5",
        mode: "text",
        estimatedTokens: 2000 // 预估平均 2K tokens
    },
    "gemini-pro": {
        category: "standalone",
        tokenRate: STANDALONE_TOKEN_RATE,
        displayName: "Gemini 3.0 Pro",
        mode: "text",
        estimatedTokens: 1500 // 预估平均 1.5K tokens
    },
    // ========== 多媒体模型（按次固定扣费）==========
    "banana-2-pro": {
        category: "media",
        fixedCost: 50,
        displayName: "Banana 2 Pro",
        mode: "image"
    },
    "suno-v5": {
        category: "media",
        fixedCost: 100,
        displayName: "Suno V5",
        mode: "music"
    },
    "sora-2-pro": {
        category: "media",
        fixedCost: 300,
        displayName: "Sora 2 Pro",
        mode: "video"
    }
};
function calculatePreviewCost(model, options) {
    const config = MODEL_COSTS[model];
    if (!config) {
        console.warn(`[Pricing] 未知模型: ${model}，使用默认价格`);
        return 20;
    }
    // 多媒体模型：固定价格
    if (config.category === "media" && config.fixedCost) {
        return Math.ceil(config.fixedCost / PROFIT_MARGIN);
    }
    // 文本模型：基于预估 Token 数计算
    const estimatedTokens = options?.estimatedInputTokens || config.estimatedTokens || 1500;
    const tokenRate = config.tokenRate || AGENT_TOKEN_RATE;
    // 预估消耗 = Token 数 / 1000 * 单价
    const estimatedCost = Math.ceil(estimatedTokens / 1000 * tokenRate);
    return estimatedCost;
}
function calculateActualCost(model, tokenUsage) {
    const config = MODEL_COSTS[model];
    if (!config) {
        console.warn(`[Pricing] 未知模型: ${model}，使用默认价格`);
        return 20;
    }
    // 多媒体模型：固定价格
    if (config.category === "media" && config.fixedCost) {
        return Math.ceil(config.fixedCost / PROFIT_MARGIN);
    }
    // 文本模型：根据实际 Token 数计费
    const tokenRate = config.tokenRate || AGENT_TOKEN_RATE;
    // 优先使用 totalTokens，否则使用 input + output
    let totalTokens = tokenUsage?.totalTokens || 0;
    if (!totalTokens && tokenUsage) {
        totalTokens = (tokenUsage.inputTokens || 0) + (tokenUsage.outputTokens || 0);
    }
    // 如果没有 Token 信息，使用预估值
    if (!totalTokens) {
        totalTokens = config.estimatedTokens || 1500;
    }
    // 实际消耗 = Token 数 / 1000 * 单价
    const actualCost = Math.ceil(totalTokens / 1000 * tokenRate);
    // 最低消费 5 积分
    return Math.max(actualCost, 5);
}
function getModelDisplayName(model) {
    return MODEL_COSTS[model]?.displayName || model;
}
function getModelMode(model) {
    return MODEL_COSTS[model]?.mode || "text";
}
function getModelCategory(model) {
    return MODEL_COSTS[model]?.category || "agent";
}
function getTokenRate(model) {
    const config = MODEL_COSTS[model];
    if (!config || config.category === "media") return 0;
    return config.tokenRate || AGENT_TOKEN_RATE;
}
const DAILY_FREE_LIMIT = 20;
const LUXURY_THRESHOLD = 1000;
const LUXURY_CREDITS = 12000;
function validateProfitMargin() {
    // 假设 VivaAPI 成本为用户价格的 40%
    const vivaApiCostRate = PROFIT_MARGIN // 0.4
    ;
    // 智能体场景
    const agentUserRate = AGENT_TOKEN_RATE // 10 积分/1K Token
    ;
    const agentCostRate = agentUserRate * vivaApiCostRate // 4 积分/1K Token
    ;
    // 豪华会员全额消耗
    const totalCredits = LUXURY_CREDITS // 12,000 积分
    ;
    const totalTokens = totalCredits / agentUserRate * 1000 // 1,200,000 Tokens
    ;
    const totalCost = totalTokens / 1000 * agentCostRate // 4,800 积分
    ;
    const costRatio = totalCost / totalCredits // 0.4 = 40%
    ;
    console.log(`[利润验证] 豪华会员 ${totalCredits} 积分消耗:`);
    console.log(`  - 可使用 Token: ${totalTokens.toLocaleString()}`);
    console.log(`  - VivaAPI 成本: ${totalCost} 积分`);
    console.log(`  - 成本占比: ${(costRatio * 100).toFixed(1)}%`);
    return costRatio <= PROFIT_MARGIN;
}
}),
"[project]/app/api/dify-chat/route.ts [app-edge-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "maxDuration",
    ()=>maxDuration,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$86$2e$0$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$edge$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@supabase+supabase-js@2.86.0/node_modules/@supabase/supabase-js/dist/module/index.js [app-edge-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pricing$2e$ts__$5b$app$2d$edge$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/pricing.ts [app-edge-route] (ecmascript)");
;
;
const runtime = "edge";
const maxDuration = 60;
// 默认的基础配置
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";
const DEFAULT_DIFY_KEY = process.env.DIFY_API_KEY;
// Supabase 客户端（用于扣费）
const supabaseAdmin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$86$2e$0$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$edge$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://rnujdnmxufmzgjvmddla.supabase.co"), process.env.SUPABASE_SERVICE_ROLE_KEY);
async function POST(request) {
    try {
        // 🔐 从 header 获取用户身份（middleware 已验证）
        const headerUserId = request.headers.get("X-User-Id");
        const body = await request.json();
        const { query, conversation_id, fileIds, userId: bodyUserId, inputs, model } = body;
        // 优先使用 header 中的 userId（更安全），其次使用 body 中的
        const userId = headerUserId || bodyUserId;
        // 🔐 二次验证：确保有用户身份
        if (!userId) {
            console.warn("🚫 [Dify-Chat] 未授权访问被拦截");
            return new Response(JSON.stringify({
                error: "未授权访问，请先登录"
            }), {
                status: 401
            });
        }
        console.log(`🔄 [切换模型] 用户: ${userId} | 目标模型: ${model || "默认标准版"} | conversation_id: ${conversation_id || "新会话"}`);
        // --- 1. 钥匙分发中心 (彻底分离通道) ---
        let targetApiKey = DEFAULT_DIFY_KEY; // 默认给标准版
        let keySource = "DEFAULT_DIFY_KEY";
        // 根据前端传来的暗号，分发不同的钥匙
        switch(model){
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
                break;
        }
        console.log(`🔑 [API Key] 使用: ${keySource} | 前缀: ${targetApiKey?.substring(0, 10)}...`);
        // 安全检查：防止忘配 Key
        if (!targetApiKey) {
            console.error(`❌ 严重错误: 模型 ${model} 的 API Key 未配置！环境变量 ${keySource} 为空`);
            return new Response(JSON.stringify({
                error: `Server Error: Key for ${model} missing`
            }), {
                status: 500
            });
        }
        // --- 2. 获取用户积分（用于预检查） ---
        const modelType = model || "standard";
        // 🔍 详细日志：查询用户积分
        console.log(`🔍 [积分查询] 开始查询用户: ${userId}`);
        // 🔥 修复：只查询存在的字段 credits 和 user_id（移除不存在的 total_spent）
        let { data: userCredits, error: creditsError } = await supabaseAdmin.from("user_credits").select("credits, user_id").eq("user_id", userId).single();
        // 🔥 关键修复：如果用户不存在，先创建积分记录（赠送 1000 积分，与注册逻辑一致）
        // 🔥 移除 total_spent 字段（数据库中不存在）
        if (creditsError?.code === "PGRST116") {
            console.log(`🆕 [新用户] 用户 ${userId} 在 user_credits 表中不存在，自动创建积分记录，赠送 1000 积分`);
            const { data: newCredits, error: insertError } = await supabaseAdmin.from("user_credits").insert({
                user_id: userId,
                credits: 1000,
                is_pro: false
            }).select().single();
            if (insertError) {
                console.error(`❌ [新用户] 创建积分记录失败:`, insertError);
                // 尝试 upsert
                const { data: upsertData, error: upsertError } = await supabaseAdmin.from("user_credits").upsert({
                    user_id: userId,
                    credits: 1000,
                    is_pro: false
                }).select().single();
                if (upsertError) {
                    console.error(`❌ [新用户] Upsert 也失败:`, upsertError);
                } else {
                    userCredits = upsertData;
                    creditsError = null;
                    console.log(`✅ [新用户] Upsert 成功，赠送 1000 积分:`, upsertData);
                }
            } else {
                userCredits = newCredits;
                creditsError = null;
                console.log(`✅ [新用户] 积分记录创建成功，赠送 1000 积分:`, newCredits);
            }
        } else if (creditsError) {
            console.error(`❌ [积分查询] 查询失败:`, creditsError);
            console.log(`📋 [调试] 错误代码: ${creditsError.code}, 错误信息: ${creditsError.message}`);
        } else {
            console.log(`✅ [积分查询] 成功: user_id=${userCredits?.user_id}, credits=${userCredits?.credits}`);
        }
        const currentCredits = userCredits?.credits || 0;
        // 预估最低消费（用于预检查）
        const estimatedMinCost = 5 // 最低 5 积分
        ;
        if (currentCredits < estimatedMinCost) {
            console.warn(`🚫 [计费] 用户 ${userId} 积分不足: 当前 ${currentCredits}`);
            return new Response(JSON.stringify({
                error: "积分不足",
                required: estimatedMinCost,
                current: currentCredits
            }), {
                status: 402
            });
        }
        console.log(`💰 [预检查] 用户: ${userId} | 模型: ${modelType} | 当前积分: ${currentCredits}`);
        // --- 3. 构造 Dify 请求函数 ---
        const callDify = async (retryWithoutId = false)=>{
            const currentConvId = retryWithoutId ? null : conversation_id;
            const difyRequest = {
                inputs: inputs || {},
                query: query || "你好",
                response_mode: "streaming",
                user: userId || "default-user",
                conversation_id: currentConvId
            };
            if (fileIds && fileIds.length > 0) {
                difyRequest.files = fileIds.map((id)=>({
                        type: 'image',
                        transfer_method: 'local_file',
                        upload_file_id: id
                    }));
            }
            const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${targetApiKey}`
                },
                body: JSON.stringify(difyRequest)
            });
            return response;
        };
        // --- 4. 执行请求与智能容错 ---
        let response = await callDify(false);
        if (response.status === 404 || response.status === 400) {
            console.warn(`⚠️ 会话 ID 冲突 (可能切换了模型)，自动开启新会话重试...`);
            response = await callDify(true);
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Dify API 最终报错 (${model}):`, errorText);
            return new Response(JSON.stringify({
                error: `Dify Error: ${errorText}`
            }), {
                status: response.status
            });
        }
        // --- 5. 流式响应 + 静默扣费 ---
        // 创建一个 TransformStream 来处理流式数据并在结束时扣费
        let totalTokens = 0;
        let conversationId = "";
        const transformStream = new TransformStream({
            async transform (chunk, controller) {
                // 直接传递数据给前端
                controller.enqueue(chunk);
                // 解析 chunk 提取 token 信息
                try {
                    const text = new TextDecoder().decode(chunk);
                    const lines = text.split("\n");
                    for (const line of lines){
                        if (!line.startsWith("data: ")) continue;
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") continue;
                        try {
                            const json = JSON.parse(data);
                            // 提取 conversation_id
                            if (json.conversation_id) {
                                conversationId = json.conversation_id;
                            }
                            // 提取 token 使用量（Dify 在 message_end 事件中返回）
                            if (json.event === "message_end" && json.metadata?.usage) {
                                totalTokens = json.metadata.usage.total_tokens || 0;
                                console.log(`📊 [Token统计] 总Token: ${totalTokens}`);
                            }
                        } catch  {}
                    }
                } catch  {}
            },
            async flush (controller) {
                // 流结束时执行静默扣费
                try {
                    // 计算实际费用
                    const actualCost = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pricing$2e$ts__$5b$app$2d$edge$2d$route$5d$__$28$ecmascript$29$__["calculateActualCost"])(modelType, {
                        totalTokens
                    });
                    // 🔥 修复：只查询存在的字段 credits（移除 total_spent）
                    const { data: latestCredits } = await supabaseAdmin.from("user_credits").select("credits").eq("user_id", userId).single();
                    const newCredits = (latestCredits?.credits || 0) - actualCost;
                    // 🔥 修复：只更新存在的字段 credits（移除 total_spent 和 updated_at）
                    const { error: updateError } = await supabaseAdmin.from("user_credits").update({
                        credits: Math.max(newCredits, 0) // 防止负数
                    }).eq("user_id", userId);
                    if (updateError) {
                        console.error(`❌ [静默扣费失败] 用户 ${userId}:`, updateError);
                    } else {
                        console.log(`✅ [静默扣费成功] 用户 ${userId}: ${latestCredits?.credits} - ${actualCost} = ${newCredits} | Token: ${totalTokens}`);
                        // 记录交易流水（可选，如果 credit_transactions 表存在）
                        try {
                            await supabaseAdmin.from("credit_transactions").insert({
                                user_id: userId,
                                amount: -actualCost,
                                type: "ai_chat",
                                description: `使用 ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pricing$2e$ts__$5b$app$2d$edge$2d$route$5d$__$28$ecmascript$29$__["getModelDisplayName"])(modelType)} 对话 (${totalTokens} tokens)`
                            });
                        } catch (txError) {
                            console.warn(`⚠️ [交易记录] 写入失败（可忽略）:`, txError);
                        }
                    }
                } catch (e) {
                    console.error(`❌ [静默扣费异常]:`, e);
                }
            }
        });
        // 返回经过 transform 处理的流
        return new Response(response.body?.pipeThrough(transformStream), {
            headers: {
                "Content-Type": "text/event-stream"
            }
        });
    } catch (error) {
        console.error("❌ 后端致命错误:", error);
        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500
        });
    }
}
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__5ce086d2._.js.map