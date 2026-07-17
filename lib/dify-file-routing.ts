import type { DifyFileObject, DifyFileType } from "@/lib/dify-types"
import { isWorkflowSkillAgent, type WorkflowSkillId } from "@/lib/workflow-skill-agents"
import { MAX_WORKFLOW_DOCUMENT_CHARS } from "@/lib/workflow-document-limits"

type DifyFileMetadata = {
  id: string
  mimeType: string
  name?: string
  extractedText?: string
}

export type DifyUploadRouting = {
  ok: true
  credentialModel: string | null
  workflowSkillId: WorkflowSkillId | null
} | {
  ok: false
  credentialModel: null
  workflowSkillId: null
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseDifyFileMetadata(value: unknown): DifyFileMetadata[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const id = normalizeString(record.id)
    const mimeType = normalizeString(record.mimeType)
    const name = normalizeString(record.name)
    const extractedText = normalizeString(record.extractedText)
    return id && mimeType ? [{
      id,
      mimeType,
      ...(name ? { name } : {}),
      ...(extractedText ? { extractedText } : {}),
    }] : []
  })
}

export function resolveDifyUploadRouting(model: unknown, workflowSkillId: unknown): DifyUploadRouting {
  if (workflowSkillId !== null && workflowSkillId !== undefined && typeof workflowSkillId !== "string") {
    return { ok: false, credentialModel: null, workflowSkillId: null }
  }
  const normalizedSkillId = normalizeString(workflowSkillId)
  if (normalizedSkillId) {
    if (!isWorkflowSkillAgent(normalizedSkillId)) {
      return { ok: false, credentialModel: null, workflowSkillId: null }
    }
    return {
      ok: true,
      credentialModel: "workflow-skill",
      workflowSkillId: normalizedSkillId,
    }
  }

  return {
    ok: true,
    credentialModel: normalizeString(model),
    workflowSkillId: null,
  }
}

export function getDifyFileTypeForMime(mimeType: unknown): DifyFileType {
  const normalizedMimeType = normalizeString(mimeType)?.toLowerCase() || ""
  if (normalizedMimeType.startsWith("image/")) return "image"
  if (normalizedMimeType.startsWith("audio/")) return "audio"
  if (normalizedMimeType.startsWith("video/")) return "video"
  if (
    normalizedMimeType.startsWith("text/") ||
    normalizedMimeType === "application/pdf" ||
    normalizedMimeType.includes("wordprocessingml") ||
    normalizedMimeType.includes("spreadsheetml") ||
    normalizedMimeType.includes("presentationml") ||
    normalizedMimeType === "application/msword" ||
    normalizedMimeType === "application/vnd.ms-excel" ||
    normalizedMimeType === "application/vnd.ms-powerpoint"
  ) {
    return "document"
  }
  return "custom"
}

export function hasCompleteDifyFileMetadata(fileIds: string[], value: unknown) {
  if (fileIds.length === 0) return true
  const metadataById = new Map(parseDifyFileMetadata(value).map((item) => [item.id, item.mimeType]))
  return fileIds.every((id) => metadataById.has(id))
}

export function hasCompleteWorkflowDocumentText(fileIds: string[], value: unknown) {
  const metadataById = new Map(parseDifyFileMetadata(value).map((item) => [item.id, item]))
  return fileIds.every((id) => {
    const metadata = metadataById.get(id)
    if (!metadata) return false
    return getDifyFileTypeForMime(metadata.mimeType) !== "document" || Boolean(metadata.extractedText)
  })
}

export function buildWorkflowSkillQuery(
  query: string,
  workflowSkillId: WorkflowSkillId,
  fileIds: string[],
  value: unknown,
) {
  const metadataById = new Map(parseDifyFileMetadata(value).map((item) => [item.id, item]))
  const documentSections = fileIds.flatMap((id) => {
    const metadata = metadataById.get(id)
    if (!metadata?.extractedText || getDifyFileTypeForMime(metadata.mimeType) !== "document") return []
    return [`【附件正文：${metadata.name || "未命名文档"}】\n${metadata.extractedText.slice(0, MAX_WORKFLOW_DOCUMENT_CHARS)}`]
  })

  return [
    `【指定技能】${workflowSkillId}`,
    `【用户要求】${query}`,
    ...documentSections,
  ].join("\n\n")
}

export function buildDifyLocalFileObjects(fileIds: string[], value: unknown): DifyFileObject[] {
  const metadataById = new Map(parseDifyFileMetadata(value).map((item) => [item.id, item.mimeType]))

  return fileIds.map((id) => ({
    type: metadataById.has(id) ? getDifyFileTypeForMime(metadataById.get(id)) : "image",
    transfer_method: "local_file",
    upload_file_id: id,
  }))
}
