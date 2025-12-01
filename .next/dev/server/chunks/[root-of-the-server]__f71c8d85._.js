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
"[project]/lib/supabase/server.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createClient",
    ()=>createClient,
    "createServerClient",
    ()=>createServerClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@supabase/ssr/dist/module/createServerClient.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
;
;
async function createServerClient() {
    const supabaseUrl = ("TURBOPACK compile-time value", "https://rnujdnmxufmzgjvmddla.supabase.co");
    const supabaseKey = ("TURBOPACK compile-time value", "sb_publishable_J6ZjOA1cvNVJE0msWjvJEA_Y3MHr9LH");
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createServerClient$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createServerClient"])(supabaseUrl, supabaseKey, {
        cookies: {
            getAll () {
                return cookieStore.getAll();
            },
            setAll (cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options })=>cookieStore.set(name, value, options));
                } catch  {
                // The "setAll" method was called from a Server Component.
                // This can be ignored if you have middleware refreshing
                // user sessions.
                }
            }
        }
    });
}
async function createClient() {
    return createServerClient();
}
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/lib/xunhupay.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createXunhupayOrder",
    ()=>createXunhupayOrder,
    "queryXunhupayOrder",
    ()=>queryXunhupayOrder,
    "verifyXunhupaySign",
    ()=>verifyXunhupaySign,
    "xunhupayConfig",
    ()=>xunhupayConfig
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
;
const xunhupayConfig = {
    appId: process.env.XUNHUPAY_APP_ID || "2019061715339",
    appSecret: process.env.XUNHUPAY_APP_SECRET || "c09c917331de8d12ee6561a1af6c9ab9",
    gateway: "https://api.xunhupay.com/payment/do.html",
    notifyUrl: process.env.NEXT_PUBLIC_APP_URL + "/api/payment/xunhupay/notify",
    returnUrl: process.env.NEXT_PUBLIC_APP_URL + "/payment/success"
};
// 生成签名 (MD5)
function generateSign(params, appSecret) {
    // 按照key排序并拼接
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys.map((key)=>`${key}=${params[key]}`).join("&");
    const stringWithSecret = `${signString}&key=${appSecret}`;
    // MD5签名
    return __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].createHash("md5").update(stringWithSecret, "utf8").digest("hex").toLowerCase();
}
function verifyXunhupaySign(params) {
    const receivedSign = params.sign;
    const paramsWithoutSign = {
        ...params
    };
    delete paramsWithoutSign.sign;
    const calculatedSign = generateSign(paramsWithoutSign, xunhupayConfig.appSecret);
    return receivedSign === calculatedSign;
}
function createXunhupayOrder(params) {
    const orderParams = {
        version: "1.1",
        appid: xunhupayConfig.appId,
        trade_order_id: params.outTradeNo,
        total_fee: params.totalAmount,
        title: params.subject,
        description: params.body || params.subject,
        time: Math.floor(Date.now() / 1000).toString(),
        notify_url: xunhupayConfig.notifyUrl,
        return_url: xunhupayConfig.returnUrl,
        type: params.paymentType || "alipay",
        nonce_str: __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(16).toString("hex")
    };
    // 生成签名
    const sign = generateSign(orderParams, xunhupayConfig.appSecret);
    const paramsWithSign = {
        ...orderParams,
        sign,
        hash: "md5"
    };
    // 生成支付URL
    const queryString = Object.keys(paramsWithSign).map((key)=>`${key}=${encodeURIComponent(paramsWithSign[key])}`).join("&");
    return `${xunhupayConfig.gateway}?${queryString}`;
}
async function queryXunhupayOrder(outTradeNo) {
    const queryParams = {
        appid: xunhupayConfig.appId,
        out_trade_order: outTradeNo,
        time: Math.floor(Date.now() / 1000).toString(),
        nonce_str: __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(16).toString("hex")
    };
    const sign = generateSign(queryParams, xunhupayConfig.appSecret);
    const paramsWithSign = {
        ...queryParams,
        sign,
        hash: "md5"
    };
    const queryString = Object.keys(paramsWithSign).map((key)=>`${key}=${encodeURIComponent(paramsWithSign[key])}`).join("&");
    const response = await fetch(`https://api.xunhupay.com/payment/query?${queryString}`);
    return response.json();
}
}),
"[project]/lib/products.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PRODUCTS",
    ()=>PRODUCTS
]);
const PRODUCTS = [
    // --- 订阅方案 (来自 pricing.tsx) ---
    {
        id: "basic",
        name: "基础版",
        description: "适合入门体验",
        priceInCents: 2800,
        features: [
            "每月 2,000 积分",
            "调用所有 AI 模型",
            "标准生成速度",
            "社区支持",
            "调用专业智能体"
        ]
    },
    {
        id: "pro",
        name: "专业版",
        description: "适合高频学生",
        priceInCents: 6800,
        features: [
            "每月 5,000 积分",
            "调用所有 AI 模型",
            "优先生成速度",
            "高级润色工具",
            "名师辅导 (1次/月)",
            "调用专业智能体"
        ],
        popular: true
    },
    {
        id: "premium",
        name: "豪华版",
        description: "适合重度用户/教育者",
        priceInCents: 12800,
        features: [
            "每月 12,000 积分",
            "调用三大顶尖模型",
            "最高优先速度",
            "高级润色工具",
            "名师辅导 (2次/月)",
            "无限次 AI 对话",
            "调用专业智能体"
        ]
    },
    // --- 积分充值包 (来自 pricing.tsx) ---
    {
        id: "credits-500",
        name: "500 积分充值包",
        description: "永久有效，适合轻度或测试用户",
        priceInCents: 500,
        features: [
            "500 积分",
            "永久有效",
            "可用于生成作文或兑换辅导"
        ]
    },
    {
        id: "credits-1000",
        name: "1000 积分充值包",
        description: "永久有效，适合轻度或测试用户",
        priceInCents: 1000,
        features: [
            "1000 积分",
            "永久有效",
            "可用于生成作文或兑换辅导"
        ]
    },
    {
        id: "credits-5000",
        name: "5000 积分充值包",
        description: "永久有效 (96折优惠)",
        priceInCents: 4800,
        features: [
            "5000 积分",
            "永久有效",
            "可用于生成作文或兑换辅导"
        ]
    },
    {
        id: "credits-10000",
        name: "10000 积分充值包",
        description: "永久有效 (9折优惠)",
        priceInCents: 9000,
        features: [
            "10000 积分",
            "永久有效",
            "可用于生成作文或兑换辅导"
        ]
    }
];
}),
"[project]/app/api/payment/xunhupay/create/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase/server.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$xunhupay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/xunhupay.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$products$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/products.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/module/index.js [app-route] (ecmascript) <locals>");
;
;
;
;
;
async function GET(request) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const productId = searchParams.get("productId");
        const paymentType = searchParams.get("type") || "alipay";
        const urlUserId = searchParams.get("userId");
        // 1. 检查配置
        if (!process.env.XUNHUPAY_APPID || !process.env.XUNHUPAY_APPSECRET) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "配置缺失：请检查 .env.local 文件并重启项目！"
            }, {
                status: 500
            });
        }
        if (!productId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "缺少产品ID"
            }, {
                status: 400
            });
        }
        // 2. 获取用户
        const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createServerClient"])();
        const { data: { user } } = await supabase.auth.getUser();
        let finalUserId = user?.id;
        if (!finalUserId && urlUserId) finalUserId = urlUserId;
        if (!finalUserId) {
            // 如果没用户，返回 401 告诉前端去登录
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "用户未登录",
                code: "UNAUTHORIZED"
            }, {
                status: 401
            });
        }
        const product = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$products$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PRODUCTS"].find((p)=>p.id === productId);
        if (!product) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "产品不存在"
            }, {
                status: 404
            });
        }
        const orderNo = `XH${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        // 3. 【防卡死优化】数据库写入不再使用 await
        // 即使数据库很慢，也不会卡住支付流程
        const adminAuthClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://rnujdnmxufmzgjvmddla.supabase.co"), process.env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                persistSession: false
            }
        }) : null;
        const dbClient = adminAuthClient || supabase;
        // 异步执行，不阻塞主线程
        dbClient.from("orders").insert({
            order_no: orderNo,
            user_id: finalUserId,
            product_id: product.id,
            product_name: product.name,
            amount: product.priceInCents / 100,
            payment_method: `xunhupay_${paymentType}`,
            status: "pending"
        }).then(({ error })=>{
            if (error) console.error("订单记录失败(不影响支付):", error);
        });
        // 4. 生成支付链接
        const cleanSubject = product.name.substring(0, 30);
        const cleanBody = (product.description || product.name).substring(0, 50);
        const paymentUrl = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$xunhupay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createXunhupayOrder"])({
            outTradeNo: orderNo,
            totalAmount: (product.priceInCents / 100).toFixed(2),
            subject: cleanSubject,
            body: cleanBody,
            paymentType
        });
        // 5. 【关键】返回 JSON 给前端，让前端去跳转
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            url: paymentUrl
        });
    } catch (error) {
        console.error("[API Error]", error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error?.message || "支付创建失败"
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__f71c8d85._.js.map