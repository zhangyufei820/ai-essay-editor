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
"[project]/app/api/dify-upload/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "maxDuration",
    ()=>maxDuration,
    "runtime",
    ()=>runtime
]);
const runtime = "nodejs";
const maxDuration = 60;
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";
const DIFY_API_KEY = process.env.DIFY_API_KEY;
async function POST(request) {
    if (!DIFY_API_KEY) {
        return new Response(JSON.stringify({
            error: "Dify API key not configured"
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
    try {
        const formData = await request.formData();
        const file = formData.get("file");
        // ✅ 修改 2: 获取前端传来的真实用户 ID
        const userId = formData.get("user");
        if (!file) {
            return new Response(JSON.stringify({
                error: "No file provided"
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json"
                }
            });
        }
        const difyFormData = new FormData();
        difyFormData.append("file", file);
        // ✅ 修改 3: 使用真实的用户 ID，保持与对话接口一致
        difyFormData.append("user", userId || "anonymous-user");
        // Dify 文件上传的正确端点
        const uploadUrl = `${DIFY_BASE_URL}/files/upload`;
        const response = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${DIFY_API_KEY}`
            },
            body: difyFormData
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Backend] Dify upload failed:", {
                status: response.status,
                url: uploadUrl,
                error: errorText
            });
            return new Response(JSON.stringify({
                error: "File upload to Dify failed",
                details: errorText,
                status: response.status
            }), {
                status: response.status,
                headers: {
                    "Content-Type": "application/json"
                }
            });
        }
        const data = await response.json();
        console.log("[Backend] Dify upload success:", {
            fileId: data.id,
            fileName: file.name,
            userId
        });
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("[Backend] Upload error:", error);
        return new Response(JSON.stringify({
            error: "Internal server error",
            details: error instanceof Error ? error.message : String(error)
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__01467092._.js.map