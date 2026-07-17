import * as mammoth from "mammoth"
import { MAX_WORKFLOW_DOCUMENT_CHARS } from "@/lib/workflow-document-limits"

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const MAX_WORKFLOW_DOCUMENT_BYTES = 20 * 1024 * 1024

export type WorkflowDocumentErrorCode =
  | "WORKFLOW_DOCUMENT_TOO_LARGE"
  | "WORKFLOW_DOCUMENT_UNSUPPORTED"
  | "WORKFLOW_DOCUMENT_EMPTY"
  | "WORKFLOW_DOCUMENT_EXTRACTION_FAILED"

export class WorkflowDocumentError extends Error {
  constructor(
    public readonly code: WorkflowDocumentErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "WorkflowDocumentError"
  }
}

function normalizeExtractedText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export async function extractWorkflowDocumentText(file: File) {
  if (file.size > MAX_WORKFLOW_DOCUMENT_BYTES) {
    throw new WorkflowDocumentError(
      "WORKFLOW_DOCUMENT_TOO_LARGE",
      413,
      "批阅文档不能超过 20MB，请压缩后重试。",
    )
  }

  let extractedText = ""
  try {
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      extractedText = await file.text()
    } else if (file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) })
      extractedText = result.value
    } else {
      throw new WorkflowDocumentError(
        "WORKFLOW_DOCUMENT_UNSUPPORTED",
        415,
        "当前批阅工具暂不支持直接读取此文档，请转换为 DOCX 或 TXT 后重试。",
      )
    }
  } catch (error) {
    if (error instanceof WorkflowDocumentError) throw error
    throw new WorkflowDocumentError(
      "WORKFLOW_DOCUMENT_EXTRACTION_FAILED",
      422,
      "文档正文读取失败，请确认文件未损坏后重新上传。",
    )
  }

  const normalizedText = normalizeExtractedText(extractedText)
  if (!normalizedText) {
    throw new WorkflowDocumentError(
      "WORKFLOW_DOCUMENT_EMPTY",
      422,
      "文档中未读取到可批阅的文字，请检查内容后重新上传。",
    )
  }
  if (normalizedText.length > MAX_WORKFLOW_DOCUMENT_CHARS) {
    throw new WorkflowDocumentError(
      "WORKFLOW_DOCUMENT_TOO_LARGE",
      413,
      "文档正文过长，请精简到 8 万字以内后重试。",
    )
  }

  return normalizedText
}
