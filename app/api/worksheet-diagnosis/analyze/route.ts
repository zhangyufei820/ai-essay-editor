import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/verified-user"
import { createRequestId } from "@/lib/ai-task-trace"
import { createBillingLog, chargeCreditsSafely } from "@/lib/billing"
import { calculateWorksheetDiagnosisCredits } from "@/lib/billing-config"
import { addCredits, getUserCredits, type BillingAuditMetadata } from "@/lib/credits"
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

function writeStreamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: Record<string, unknown>,
) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`))
}

async function refundWorksheetDiagnosisCredits(input: {
  userId: string
  requestId: string
  amount: number
  reason: string
  metadata?: BillingAuditMetadata
}) {
  if (input.amount <= 0) return false

  return addCredits(
    input.userId,
    input.amount,
    "refund",
    `错题诊断失败自动退回积分：${input.amount}`,
    `refund:${input.requestId}`,
    createBillingLog({
      ...(input.metadata || {}),
      actionType: "worksheet_diagnosis_refund",
      feature: "worksheet-diagnosis",
      usageSource: "fixed",
      estimated: true,
      chargedCredits: input.amount,
      requestId: input.requestId,
      rawProviderMetadata: {
        ...(input.metadata?.rawProviderMetadata || {}),
        refundReason: input.reason,
      },
    }),
  )
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("X-Request-Id") || createRequestId("worksheet")
  let chargedCredits = 0
  let billingMetadata: BillingAuditMetadata | undefined
  let userIdForRefund = ""
  const startedAt = Date.now()

  const ip = getClientIP(request)
  const limitResult = checkIpRateLimit(ip, 20)
  if (!limitResult.allowed) return createRateLimitResponse(limitResult.retryAfter!)

  const auth = await requireUser(request)
  if (auth.response) return auth.response
  userIdForRefund = auth.user!.id

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

    chargedCredits = calculateWorksheetDiagnosisCredits(parsed.data.images.length)
    const credits = await getUserCredits(auth.user!.id)
    if (!credits || credits.credits < chargedCredits) {
      return NextResponse.json(
        {
          error: `当前积分不足，本次诊断需要 ${chargedCredits} 积分。`,
          code: "INSUFFICIENT_CREDITS",
          requiredCredits: chargedCredits,
          currentCredits: credits?.credits ?? 0,
        },
        { status: 402, headers: { "X-Request-Id": requestId } },
      )
    }

    billingMetadata = createBillingLog({
      userId: auth.user!.id,
      actionType: "worksheet_diagnosis",
      feature: "worksheet-diagnosis",
      modelId: "worksheet-diagnosis",
      usageSource: "fixed",
      estimated: true,
      chargedCredits,
      requestId,
      description: `错题诊断：${parsed.data.images.length} 张试卷图片`,
      rawProviderMetadata: {
        imageCount: parsed.data.images.length,
        reportStyle: parsed.data.reportStyle,
        subject: parsed.data.subject,
        grade: parsed.data.grade || null,
      },
    })

    const wasCharged = await chargeCreditsSafely(
      auth.user!.id,
      chargedCredits,
      "worksheet_diagnosis",
      `错题诊断：${parsed.data.images.length} 张试卷图片`,
      requestId,
      billingMetadata,
    )

    if (!wasCharged) {
      return NextResponse.json(
        {
          error: `当前积分不足，本次诊断需要 ${chargedCredits} 积分。`,
          code: "INSUFFICIENT_CREDITS",
          requiredCredits: chargedCredits,
          currentCredits: credits.credits,
        },
        { status: 402, headers: { "X-Request-Id": requestId } },
      )
    }

    console.log("[WorksheetDiagnosis] analyze started", {
      requestId,
      userId: auth.user!.id,
      imageCount: parsed.data.images.length,
      chargedCredits,
    })

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let settled = false
        writeStreamEvent(controller, {
          type: "progress",
          requestId,
          message: "已开始诊断，请稍候。",
          billing: {
            chargedCredits,
            refunded: false,
            imageCount: parsed.data.images.length,
          },
        })

        const heartbeat = setInterval(() => {
          if (settled) return
          writeStreamEvent(controller, {
            type: "progress",
            requestId,
            elapsedMs: Date.now() - startedAt,
            message: "正在识别卷面并生成诊断。",
          })
        }, 10_000)

        ;(async () => {
          try {
            const credential = getDifyCredentialForModel("worksheet-diagnosis")
            const workflow = await runDifyWorkflow({
              apiKey: credential.credential,
              user: auth.user!.id,
              inputs: buildWorksheetDiagnosisInputs(parsed.data),
              responseMode: "blocking",
              timeoutMs: Number(process.env.DIFY_WORKSHEET_DIAGNOSIS_TIMEOUT_MS || 120_000),
            })

            if (workflow.status && workflow.status !== "succeeded") {
              const refunded = await refundWorksheetDiagnosisCredits({
                userId: auth.user!.id,
                requestId,
                amount: chargedCredits,
                reason: `workflow_status_${workflow.status}`,
                metadata: billingMetadata,
              })

              writeStreamEvent(controller, {
                type: "error",
                requestId,
                error: "错题诊断服务暂时不可用，请稍后重试。",
                code: "DIFY_WORKFLOW_NOT_SUCCEEDED",
                status: workflow.status,
                workflowRunId: workflow.workflowRunId,
                billing: {
                  chargedCredits,
                  refunded,
                },
              })
              return
            }

            const diagnosis = parseWorksheetDiagnosis(workflow.outputs)
            const renderPrompt = buildWorksheetReportRenderPrompt(diagnosis, parsed.data.reportStyle)
            console.log("[WorksheetDiagnosis] analyze completed", {
              requestId,
              workflowRunId: workflow.workflowRunId,
              elapsedMs: Date.now() - startedAt,
            })

            writeStreamEvent(controller, {
              type: "result",
              ok: true,
              requestId,
              workflowRunId: workflow.workflowRunId,
              taskId: workflow.taskId,
              diagnosis,
              renderPrompt,
              rawOutputs: workflow.outputs,
              billing: {
                chargedCredits,
                refunded: false,
                imageCount: parsed.data.images.length,
              },
            })
          } catch (error) {
            const refunded = await refundWorksheetDiagnosisCredits({
              userId: userIdForRefund,
              requestId,
              amount: chargedCredits,
              reason: error instanceof Error ? error.message : String(error),
              metadata: billingMetadata,
            })

            console.error("[WorksheetDiagnosis] analyze failed", {
              requestId,
              message: error instanceof Error ? error.message : String(error),
              elapsedMs: Date.now() - startedAt,
              refunded,
            })
            const mapped = mapAnalyzeError(error)
            writeStreamEvent(controller, {
              type: "error",
              requestId,
              ...mapped.body,
              status: mapped.status,
              billing: {
                chargedCredits,
                refunded,
              },
            })
          } finally {
            settled = true
            clearInterval(heartbeat)
            controller.close()
          }
        })()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Request-Id": requestId,
      },
    })
  } catch (error) {
    console.error("[WorksheetDiagnosis] analyze failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    })
    const mapped = mapAnalyzeError(error)
    return NextResponse.json(mapped.body, {
      status: mapped.status,
      headers: { "X-Request-Id": requestId },
    })
  }
}
