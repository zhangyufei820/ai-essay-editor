module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/events [external] (events, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("events", () => require("events"));

module.exports = mod;
}),
"[externals]/http [external] (http, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("http", () => require("http"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/child_process [external] (child_process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("child_process", () => require("child_process"));

module.exports = mod;
}),
"[project]/lib/stripe.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "stripe",
    ()=>stripe
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$server$2d$only$2f$empty$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/server-only/empty.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$stripe$2f$esm$2f$stripe$2e$esm$2e$node$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/stripe/esm/stripe.esm.node.js [app-rsc] (ecmascript)");
;
;
const stripe = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$stripe$2f$esm$2f$stripe$2e$esm$2e$node$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"](process.env.STRIPE_SECRET_KEY);
}),
"[project]/lib/products.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/app/actions/stripe.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"4003b72decb6d81d10325f35d907014fc9cb8373a6":"getPaymentStatus","401226c4cc1ee62bf54b8a46a33bbb7a18b46fd161":"startCheckoutSession"},"",""] */ __turbopack_context__.s([
    "getPaymentStatus",
    ()=>getPaymentStatus,
    "startCheckoutSession",
    ()=>startCheckoutSession
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/stripe.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$products$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/products.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
async function startCheckoutSession(productId) {
    if (!__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stripe"]) {
        throw new Error("Stripe 未配置，请使用其他支付方式");
    }
    const product = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$products$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["PRODUCTS"].find((p)=>p.id === productId);
    if (!product) {
        throw new Error(`产品 "${productId}" 不存在`);
    }
    if (product.priceInCents === 0) {
        throw new Error("免费产品无需支付");
    }
    try {
        // 创建Stripe结账会话，支持多种支付方式
        const session = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stripe"].checkout.sessions.create({
            ui_mode: "embedded",
            redirect_on_completion: "never",
            line_items: [
                {
                    price_data: {
                        currency: "cny",
                        product_data: {
                            name: product.name,
                            description: product.description
                        },
                        unit_amount: product.priceInCents
                    },
                    quantity: 1
                }
            ],
            mode: "payment",
            payment_method_types: [
                "card"
            ]
        });
        return session.client_secret;
    } catch (error) {
        console.error("[v0] Stripe session creation error:", error);
        throw new Error(error?.message || "创建支付会话失败");
    }
}
async function getPaymentStatus(sessionId) {
    if (!__TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stripe"]) {
        throw new Error("Stripe 未配置");
    }
    const session = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["stripe"].checkout.sessions.retrieve(sessionId);
    return {
        status: session.status,
        payment_status: session.payment_status,
        customer_email: session.customer_details?.email
    };
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    startCheckoutSession,
    getPaymentStatus
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(startCheckoutSession, "401226c4cc1ee62bf54b8a46a33bbb7a18b46fd161", null);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(getPaymentStatus, "4003b72decb6d81d10325f35d907014fc9cb8373a6", null);
}),
"[project]/.next-internal/server/app/checkout/[productId]/page/actions.js { ACTIONS_MODULE0 => \"[project]/app/actions/stripe.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/actions/stripe.ts [app-rsc] (ecmascript)");
;
}),
"[project]/.next-internal/server/app/checkout/[productId]/page/actions.js { ACTIONS_MODULE0 => \"[project]/app/actions/stripe.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "401226c4cc1ee62bf54b8a46a33bbb7a18b46fd161",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["startCheckoutSession"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$checkout$2f5b$productId$5d2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$app$2f$actions$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/checkout/[productId]/page/actions.js { ACTIONS_MODULE0 => "[project]/app/actions/stripe.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$actions$2f$stripe$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/actions/stripe.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d2d9209a._.js.map