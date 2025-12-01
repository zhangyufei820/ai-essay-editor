module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/app/api/payment/xunhupay/create/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
;
;
// 假设您的商品列表
const PRODUCTS = [
    {
        id: "monthly_vip",
        name: "基础版会员",
        priceInCents: 2800
    },
    {
        id: "pro",
        name: "专业版",
        priceInCents: 6800
    }
];
// =================================================================
// 1. 签名算法 (严格遵照虎皮椒官方 PHP Demo 逻辑)
// =================================================================
function gen_sign(params, appSecret) {
    // 1. 按照 ASCII 码排序
    const sortedKeys = Object.keys(params).sort();
    let str = "";
    for (const key of sortedKeys){
        // 2. 过滤掉空值、undefined、hash
        if (params[key] !== "" && params[key] !== undefined && key !== "hash") {
            str += `${key}=${params[key]}&`;
        }
    }
    // 3. 拼接密钥：官方文档要求后缀为 hash_key
    str += `hash_key=${appSecret}`;
    // 4. MD5 加密并转 **小写** (官方默认是小写)
    return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].createHash("md5").update(str, "utf8").digest("hex").toLowerCase();
}
async function GET(request) {
    try {
        // 👇👇👇 账号信息 (请确保无空格) 👇👇👇
        const APP_ID = "201906175339";
        const APP_SECRET = "5f9c2b5d451978f6f369375cf7247cf7";
        // -------------------------------------------------------------
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");
        // 默认商品逻辑
        const product = PRODUCTS.find((p)=>p.id === productId);
        const price = product ? (product.priceInCents / 100).toFixed(2) : "0.01";
        // 标题：使用纯英文，防止编码问题导致签名错误
        const safeTitle = "VIP_Service";
        const tradeOrderId = `ORDER_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        // 3. 组装参数 (不要包含 hash)
        const params = {
            version: "1.1",
            appid: APP_ID,
            trade_order_id: tradeOrderId,
            total_fee: price,
            title: safeTitle,
            time: Math.floor(Date.now() / 1000).toString(),
            nonce_str: Math.floor(Math.random() * 1000000).toString(),
            type: "WAP",
            wap_url: "http://localhost:3000",
            notify_url: "http://localhost:3000/api/payment/callback"
        };
        // 4. 计算签名
        params.hash = gen_sign(params, APP_SECRET);
        // 5. 服务端发起 POST 请求
        console.log("🚀 [后端] 正在向虎皮椒发起 POST 请求:", params);
        // 将参数转换为 URLSearchParams (模拟表单提交)
        const formData = new URLSearchParams(params);
        const response = await fetch("https://api.xunhupay.com/payment/do.html", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                // 部分防火墙需要 Referer
                "Referer": "http://localhost:3000"
            },
            body: formData
        });
        // 6. 处理响应 (关键：处理非标准 HTTP 响应)
        const responseText = await response.text();
        console.log("🚀 [后端] 支付网关响应内容:", responseText);
        // 检查是否有错误提示
        if (responseText.includes("错误的签名") || responseText.includes("invalid")) {
            throw new Error(`支付网关拒绝: ${responseText}`);
        }
        // 7. 尝试解析 JSON 获取跳转链接
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            // 如果无法解析 JSON，说明网关返回了 HTML 或其他内容
            console.error("JSON解析失败，原始响应:", responseText);
            throw new Error("无法获取支付链接，请检查后端日志");
        }
        // 虎皮椒通常返回 url (H5跳转) 或 url_qrcode (PC扫码)
        const finalPayUrl = data.url || data.url_qrcode;
        if (!finalPayUrl) {
            throw new Error("未接收到支付链接 (url 字段为空)");
        }
        // 8. 成功！返回给前端
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            url: finalPayUrl,
            trade_order_id: tradeOrderId
        });
    } catch (error) {
        console.error("❌ API Error:", error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error.message
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__562316d2._.js.map