(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/[root-of-the-server]__6d478e62._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/app/api/dify-upload/route.ts [app-edge-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "runtime",
    ()=>runtime
]);
const runtime = "edge";
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
        difyFormData.append("user", `user-${Date.now()}`);
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
            console.error("[v0] Dify upload failed:", {
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
        console.log("[v0] Dify upload success:", {
            fileId: data.id,
            fileName: file.name
        });
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("[v0] Upload error:", error);
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
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__6d478e62._.js.map