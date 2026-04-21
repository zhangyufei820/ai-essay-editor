import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DIFY_BASE_URL = process.env.DIFY_INTERNAL_URL
  || process.env.DIFY_BASE_URL
  || "https://api.dify.ai/v1"
const DIFY_GPT_IMAGE_API_KEY = process.env.DIFY_GPT_IMAGE_API_KEY

/**
 * 轮询 Dify Workflow 任务状态
 * 用于 GPT Image 2 异步模式
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const taskId = searchParams.get("task_id")

    if (!taskId) {
        return NextResponse.json({ error: "task_id is required" }, { status: 400 })
    }

    try {
        console.log(`🎨 [GPT Image 2 轮询] task_id=${taskId}`)

        const response = await fetch(
            `${DIFY_BASE_URL}/workflows/run/${taskId}`,
            {
                headers: {
                    "Authorization": `Bearer ${DIFY_GPT_IMAGE_API_KEY}`,
                },
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ [GPT Image 2 轮询] Dify API 错误: ${errorText}`)
            return NextResponse.json(
                { error: `Dify API error: ${errorText}` },
                { status: response.status }
            )
        }

        const result = await response.json()
        console.log(`🎨 [GPT Image 2 轮询] 状态: ${result.data?.status || "unknown"}`)

        return NextResponse.json(result)
    } catch (error) {
        console.error(`❌ [GPT Image 2 轮询] 异常:`, error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
