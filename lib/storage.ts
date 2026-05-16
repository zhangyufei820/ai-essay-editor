import { del, put } from "@vercel/blob"
import { isCosConfigured, uploadBufferToCos } from "@/lib/cos"

function hasVercelBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function hasUsablePublicCosDelivery(): boolean {
  const configuredCdn = process.env.NEXT_PUBLIC_CDN_URL || process.env.TENCENT_COS_CDN_DOMAIN || ""
  const normalizedCdn = configuredCdn.replace(/\/+$/, "")

  // cdn.shenxiang.school is kept as a future expansion hook, but it is not
  // currently a stable public delivery endpoint. Avoid writing broken URLs.
  if (normalizedCdn === "https://cdn.shenxiang.school" && process.env.ENABLE_SHENXIANG_CDN !== "true") {
    return false
  }

  return Boolean(normalizedCdn)
}

export function canPersistUploadedFiles(): boolean {
  return hasVercelBlobToken() || (isCosConfigured() && hasUsablePublicCosDelivery())
}

function getFileExtension(fileName: string, fileType?: string): string {
  const nameExtension = fileName.split(".").pop()?.trim().toLowerCase()
  if (nameExtension && nameExtension !== fileName.toLowerCase()) {
    return nameExtension.replace(/[^a-z0-9]/g, "") || "bin"
  }

  const typeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  }

  return typeMap[fileType || ""] || fileType?.split("/").pop()?.replace(/[^a-z0-9]/g, "") || "bin"
}

function decodeBase64File(base64Data: string): Buffer {
  const base64Content = base64Data.includes(",")
    ? base64Data.split(",").slice(1).join(",")
    : base64Data

  if (!base64Content) {
    throw new Error("文件内容为空")
  }

  return Buffer.from(base64Content, "base64")
}

async function uploadBuffer(buffer: Buffer, fileName: string, fileType?: string): Promise<string> {
  if (hasVercelBlobToken()) {
    const blob = await put(`uploads/${Date.now()}-${fileName}`, buffer, {
      access: "public",
      contentType: fileType,
    })
    return blob.url
  }

  if (isCosConfigured() && hasUsablePublicCosDelivery()) {
    const result = await uploadBufferToCos(buffer, "dify", getFileExtension(fileName, fileType), fileName)
    if (result.success && result.cdnUrl) {
      return result.cdnUrl
    }
    throw new Error(result.error || "COS 上传失败")
  }

  throw new Error("文件存储未配置")
}

export async function uploadFile(file: File, userId: string): Promise<string> {
  try {
    if (hasVercelBlobToken()) {
      const blob = await put(`uploads/${userId}/${Date.now()}-${file.name}`, file, {
        access: "public",
      })
      return blob.url
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    return await uploadBuffer(buffer, `${userId}-${file.name}`, file.type)
  } catch (error) {
    console.error("[v0] File upload error:", error)
    throw new Error("文件上传失败")
  }
}

export async function deleteFile(url: string): Promise<void> {
  if (!hasVercelBlobToken()) {
    console.warn("[v0] Blob token not configured; skip deleting external storage URL")
    return
  }

  try {
    await del(url)
  } catch (error) {
    console.error("[v0] File deletion error:", error)
    throw new Error("文件删除失败")
  }
}

export async function uploadBase64File(
  base64Data: string,
  fileName: string,
  fileType: string,
  userId: string,
): Promise<string> {
  try {
    const buffer = decodeBase64File(base64Data)
    return await uploadBuffer(buffer, `${userId}-${fileName}`, fileType)
  } catch (error) {
    console.error("[v0] Base64 file upload error:", error)
    throw new Error("文件上传失败")
  }
}
