import { put, del } from "@vercel/blob"

export async function uploadFile(file: File, userId: string): Promise<string> {
  try {
    const blob = await put(`uploads/${userId}/${Date.now()}-${file.name}`, file, {
      access: "public",
    })
    return blob.url
  } catch (error) {
    console.error("[v0] File upload error:", error)
    throw new Error("文件上传失败")
  }
}

export async function deleteFile(url: string): Promise<void> {
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
    // 将base64转换为Blob
    const base64Content = base64Data.split(",")[1]
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: fileType })

    // 上传到Vercel Blob
    const result = await put(`uploads/${userId}/${Date.now()}-${fileName}`, blob, {
      access: "public",
      contentType: fileType,
    })

    return result.url
  } catch (error) {
    console.error("[v0] Base64 file upload error:", error)
    throw new Error("文件上传失败")
  }
}
