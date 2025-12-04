(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/[root-of-the-server]__dd890a8d._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
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
;
const runtime = "edge";
const maxDuration = 60;
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const COST_ESSAY = 250;
const COST_CHAT = 20;
async function POST(request) {
    if (!DIFY_API_KEY) {
        return new Response(JSON.stringify({
            error: "Dify API key not configured"
        }), {
            status: 500
        });
    }
    try {
        const body = await request.json();
        const { query, conversation_id, fileIds, userId, inputs } = body;
        console.log(`👤 [User: ${userId}] 请求 Dify...`);
        // 1. 计费逻辑 (略，保持之前一致)
        const hasFiles = fileIds && fileIds.length > 0;
        const isLongText = query && query.length > 150;
        const isHeavyTask = hasFiles || isLongText;
        const currentCost = isHeavyTask ? COST_ESSAY : COST_CHAT;
        if (userId) {
            try {
                const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$86$2e$0$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$edge$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://rnujdnmxufmzgjvmddla.supabase.co"), process.env.SUPABASE_SERVICE_ROLE_KEY);
                const { data: userData } = await supabase.from('user_credits').select('credits').eq('user_id', userId).single();
                if (userData) {
                    if (userData.credits < currentCost) {
                        return new Response(JSON.stringify({
                            error: `积分不足！需要 ${currentCost}，剩余 ${userData.credits}`
                        }), {
                            status: 402
                        });
                    }
                    await supabase.from('user_credits').update({
                        credits: userData.credits - currentCost
                    }).eq('user_id', userId);
                    console.log(`💰 扣费成功: -${currentCost}`);
                }
            } catch (e) {
                console.error("扣费模块错误:", e);
            }
        }
        // 2. 🛡️ ID 格式清洗 (防止 400 错误)
        // Dify 的 conversation_id 必须是 UUID 格式
        // 如果前端传了时间戳(纯数字)或者无效字符串，我们强制置为 null
        let validConversationId = conversation_id;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (conversation_id && !uuidRegex.test(conversation_id)) {
            console.warn("⚠️ 检测到无效的 conversation_id (可能是本地临时ID)，已自动忽略:", conversation_id);
            validConversationId = null;
        }
        // 3. 构造请求
        const difyRequest = {
            inputs: inputs || {},
            query: query || "请帮我批改这篇作文",
            response_mode: "streaming",
            user: userId || "default-user",
            conversation_id: validConversationId
        };
        if (hasFiles) {
            difyRequest.files = fileIds.map((id)=>({
                    type: 'image',
                    transfer_method: 'local_file',
                    upload_file_id: id
                }));
        }
        // 4. 调用
        const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${DIFY_API_KEY}`
            },
            body: JSON.stringify(difyRequest)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ Dify 返回错误:", errorText);
            // 返回详细错误给前端，方便调试
            return new Response(JSON.stringify({
                error: `Dify Error (${response.status}): ${errorText}`
            }), {
                status: response.status
            });
        }
        return new Response(response.body, {
            headers: {
                "Content-Type": "text/event-stream"
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500
        });
    }
}
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__dd890a8d._.js.map