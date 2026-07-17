import {
  buildDifyLocalFileObjects,
  buildWorkflowSkillQuery,
  getDifyFileTypeForMime,
  hasCompleteDifyFileMetadata,
  hasCompleteWorkflowDocumentText,
  resolveDifyUploadRouting,
} from "@/lib/dify-file-routing"
import { getDifyTerminalFailure } from "@/lib/dify-stream-failure"
import { extractWorkflowDocumentText, WorkflowDocumentError } from "@/lib/workflow-document-content"
import { readFileSync } from "fs"
import path from "path"

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8")

describe("Dify file routing", () => {
  it("routes workflow-skill uploads through the shared workflow credential", () => {
    expect(resolveDifyUploadRouting("general-chat", "shenxiang-gaozhong-lunshuowen")).toEqual({
      ok: true,
      credentialModel: "workflow-skill",
      workflowSkillId: "shenxiang-gaozhong-lunshuowen",
    })
  })

  it("rejects an unknown workflow skill instead of falling back to another app", () => {
    expect(resolveDifyUploadRouting("general-chat", "unknown-workflow")).toEqual({
      ok: false,
      credentialModel: null,
      workflowSkillId: null,
    })
  })

  it("maps supported MIME families to Dify file types", () => {
    expect(getDifyFileTypeForMime("image/png")).toBe("image")
    expect(getDifyFileTypeForMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("document")
    expect(getDifyFileTypeForMime("application/pdf")).toBe("document")
    expect(getDifyFileTypeForMime("text/plain")).toBe("document")
    expect(getDifyFileTypeForMime("audio/mpeg")).toBe("audio")
    expect(getDifyFileTypeForMime("video/mp4")).toBe("video")
    expect(getDifyFileTypeForMime("application/octet-stream")).toBe("custom")
  })

  it("aligns MIME metadata to each upload file id", () => {
    const files = buildDifyLocalFileObjects(
      ["doc-file-id", "image-file-id"],
      [
        { id: "image-file-id", mimeType: "image/png" },
        {
          id: "doc-file-id",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    )

    expect(files).toEqual([
      { type: "document", transfer_method: "local_file", upload_file_id: "doc-file-id" },
      { type: "image", transfer_method: "local_file", upload_file_id: "image-file-id" },
    ])
  })

  it("detects stale clients that omit workflow attachment metadata", () => {
    expect(hasCompleteDifyFileMetadata(["doc-file-id"], [])).toBe(false)
    expect(hasCompleteDifyFileMetadata(
      ["doc-file-id"],
      [{ id: "doc-file-id", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }],
    )).toBe(true)
  })

  it("requires extracted text for workflow documents", () => {
    const metadata = {
      id: "doc-file-id",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: "essay.docx",
    }
    expect(hasCompleteWorkflowDocumentText([metadata.id], [metadata])).toBe(false)
    expect(hasCompleteWorkflowDocumentText([metadata.id], [{ ...metadata, extractedText: "作文正文" }])).toBe(true)
    expect(hasCompleteWorkflowDocumentText(
      ["image-file-id"],
      [{ id: "image-file-id", mimeType: "image/png" }],
    )).toBe(true)
  })

  it("injects the selected skill and extracted document text into the workflow query", () => {
    expect(buildWorkflowSkillQuery(
      "请完整批阅",
      "shenxiang-gaozhong-lunshuowen",
      ["doc-file-id"],
      [{
        id: "doc-file-id",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "essay.docx",
        extractedText: "在信息洪流中保持独立判断",
      }],
    )).toContain("【指定技能】shenxiang-gaozhong-lunshuowen\n\n【用户要求】请完整批阅\n\n【附件正文：essay.docx】\n在信息洪流中保持独立判断")
  })
})

describe("Dify terminal failures", () => {
  it("turns an invalid uploaded file into an immediate public retry message", () => {
    expect(getDifyTerminalFailure({
      event: "workflow_finished",
      data: {
        status: "failed",
        error: "ValueError: Invalid upload file.",
      },
    })).toEqual({
      code: "DIFY_INVALID_UPLOAD_FILE",
      publicMessage: "附件已失效或与当前批阅工具不匹配，请重新上传文件后再试。",
      rawMessage: "ValueError: Invalid upload file.",
    })
  })

  it("does not classify successful workflow completion as a failure", () => {
    expect(getDifyTerminalFailure({
      event: "workflow_finished",
      data: { status: "succeeded" },
    })).toBeNull()
  })

  it("also terminates explicit Dify error events", () => {
    expect(getDifyTerminalFailure({
      event: "error",
      message: "Invalid upload file",
    })?.code).toBe("DIFY_INVALID_UPLOAD_FILE")
  })
})

describe("Workflow document extraction", () => {
  it("normalizes text documents before they enter the workflow query", async () => {
    const file = new File([" 第一段。\r\n\r\n\r\n第二段。 "], "essay.txt", { type: "text/plain" })
    await expect(extractWorkflowDocumentText(file)).resolves.toBe("第一段。\n\n第二段。")
  })

  it("rejects unsupported workflow documents before uploading to Dify", async () => {
    const file = new File(["%PDF"], "essay.pdf", { type: "application/pdf" })
    await expect(extractWorkflowDocumentText(file)).rejects.toMatchObject<Partial<WorkflowDocumentError>>({
      code: "WORKFLOW_DOCUMENT_UNSUPPORTED",
      status: 415,
    })
  })
})

describe("Dify file routing integration", () => {
  it("keeps upload and chat credential scopes aligned", () => {
    const chat = read("components/chat/enhanced-chat-interface.tsx")
    const uploadRoute = read("app/api/dify-upload/route.ts")

    expect(chat).toContain('formData.append("workflowSkillId", workflowSkillId)')
    expect(uploadRoute).toContain("resolveDifyUploadRouting(model || modelFromForm")
    expect(uploadRoute).toContain("const targetModel = uploadRouting.credentialModel")
  })

  it("sends MIME metadata and terminates terminal failures", () => {
    const chat = read("components/chat/enhanced-chat-interface.tsx")
    const route = read("app/api/dify-chat/route.ts")

    expect(chat).toContain("fileAttachments,")
    expect(route).toContain("difyRequest.files = difyFiles")
    expect(route).toContain("hasCompleteDifyFileMetadata(difyFileIds, fileAttachments)")
    expect(route).toContain("hasCompleteWorkflowDocumentText(difyFileIds, fileAttachments)")
    expect(route).toContain("buildWorkflowSkillQuery(effectiveQuery, workflowSkillId")
    expect(route).toContain("const terminalFailure = getDifyTerminalFailure(json)")
    expect(route).toContain("controller.terminate()")
  })
})
