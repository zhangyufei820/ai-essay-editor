import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { createRequestId } from "@/lib/ai-task-trace"
import { getDifyCredentialForModel } from "@/lib/dify-credentials"
import { runDifyWorkflow } from "@/lib/dify-workflow-client"
import { getClientIP, checkIpRateLimit, createRateLimitResponse } from "@/lib/rate-limit"
import {
  WorksheetDiagnosisRequestSchema,
  buildWorksheetDiagnosisInputs,
  buildWorksheetReportRenderPrompt,
  parseWorksheetDiagnosis,
} from "@/lib/worksheet-diagnosis"

export const runtime = "nodejs"
export const maxDuration = 180
export const dynamic = "force-dynamic"

function mapAnalyzeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message === "DIFY_WORKFLOW_TIMEOUT") {
    return {
      status: 504,
      body: {
        error: "诊断等待超时，请先减少图片数量或压缩图片后重试。",
        code: "DIFY_WORKFLOW_TIMEOUT",
      },
    }
  }

  if (message === "DIFY_WORKFLOW_API_KEY_MISSING") {
    return {
      status: 500,
      body: {
        error: "错题诊断服务暂未启用，请联系管理员处理。",
        code: "DIFY_WORKSHEET_DIAGNOSIS_KEY_MISSING",
      },
    }
  }

  if (/workflow not published/i.test(message)) {
    return {
      status: 503,
      body: {
        error: "错题诊断服务还未启用，请稍后再试。",
        code: "WORKSHEET_DIAGNOSIS_NOT_READY",
      },
    }
  }

  return {
    status: 502,
    body: {
      error: "错题诊断服务暂时不可用，请稍后重试。",
      code: "DIFY_WORKFLOW_FAILED",
    },
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("X-Request-Id") || createRequestId("worksheet")

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 20)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  const auth = await requireUser(request)
  if (auth.response) return auth.response

  try {
    const json = await request.json()
    const parsed = WorksheetDiagnosisRequestSchema.safeParse(json)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "请求参数不完整，请至少上传一张试卷图片。",
          code: "BAD_WORKSHEET_DIAGNOSIS_REQUEST",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers: { "X-Request-Id": requestId } },
      )
    }

    const credential = getDifyCredentialForModel("worksheet-diagnosis")
    const workflow = await runDifyWorkflow({
      apiKey: credential.credential,
      user: auth.user!.id,
      inputs: buildWorksheetDiagnosisInputs(parsed.data),
      responseMode: "blocking",
      timeoutMs: Number(process.env.DIFY_WORKSHEET_DIAGNOSIS_TIMEOUT_MS || 120_000),
    })

    if (workflow.status && workflow.status !== "succeeded") {
      return NextResponse.json(
        {
          error: "错题诊断服务暂时不可用，请稍后重试。",
          code: "DIFY_WORKFLOW_NOT_SUCCEEDED",
          status: workflow.status,
          workflowRunId: workflow.workflowRunId,
        },
        { status: 502, headers: { "X-Request-Id": requestId } },
      )
    }

    const diagnosis = parseWorksheetDiagnosis(workflow.outputs)
    const renderPrompt = buildWorksheetReportRenderPrompt(diagnosis, parsed.data.reportStyle)

    return NextResponse.json(
      {
        ok: true,
        requestId,
        workflowRunId: workflow.workflowRunId,
        taskId: workflow.taskId,
        diagnosis,
        renderPrompt,
        rawOutputs: workflow.outputs,
      },
      { headers: { "X-Request-Id": requestId } },
    )
  } catch (error) {
    console.error("[WorksheetDiagnosis] analyze failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    })
    const mapped = mapAnalyzeError(error)
    return NextResponse.json(mapped.body, {
      status: mapped.status,
      headers: { "X-Request-Id": requestId },
    })
  }
}
