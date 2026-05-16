import { uploadBufferToCos } from "@/lib/cos"

function extensionFromName(fileName: string, fileType?: string) {
  const ext = fileName.split(".").pop()?.toLowerCase()
  if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext
  if (fileType?.includes("png")) return "png"
  if (fileType?.includes("jpeg") || fileType?.includes("jpg")) return "jpg"
  if (fileType?.includes("webp")) return "webp"
  if (fileType?.includes("pdf")) return "pdf"
  return "bin"
}

export async function uploadFile(file: File, _userId: string): Promise<string> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadBufferToCos(buffer, "other", extensionFromName(file.name, file.type), file.name)
    if (!result.success || !result.cdnUrl) throw new Error(result.error || "COS 上传失败")
    return result.cdnUrl
  } catch (error) {
    console.error("[v0] File upload error:", error)
    throw new Error("文件上传失败")
  }
}

export async function deleteFile(url: string): Promise<void> {
  console.warn("[storage] deleteFile is not implemented for COS URLs:", url.slice(0, 80))
}

export async function uploadBase64File(
  base64Data: string,
  fileName: string,
  fileType: string,
  _userId: string,
): Promise<string> {
  try {
    // 将base64转换为Blob
    const base64Content = base64Data.split(",")[1]
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const result = await uploadBufferToCos(Buffer.from(bytes), "other", extensionFromName(fileName, fileType), fileName)
    if (!result.success || !result.cdnUrl) throw new Error(result.error || "COS 上传失败")
    return result.cdnUrl
  } catch (error) {
    console.error("[v0] Base64 file upload error:", error)
    throw new Error("文件上传失败")
  }
}
