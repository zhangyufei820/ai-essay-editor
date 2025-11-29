import { NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File
    const ocrProvider = (formData.get("ocrProvider") as string) || "google-vision"

    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 })
    }

    const fileType = file.type
    let extractedText = ""

    // 根据文件类型处理
    if (fileType.includes("pdf")) {
      extractedText = await processPDF(file, ocrProvider)
    } else if (fileType.includes("word") || fileType.includes("document")) {
      extractedText = await processWord(file)
    } else if (fileType.includes("image")) {
      extractedText = await processImage(file, ocrProvider)
    } else if (fileType.includes("text")) {
      extractedText = await file.text()
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileType,
      extractedText,
      wordCount: extractedText.length,
    })
  } catch (error) {
    console.error("[v0] Document processing error:", error)
    return NextResponse.json({ error: "文档处理失败" }, { status: 500 })
  }
}

async function processPDF(file: File, ocrProvider: string): Promise<string> {
  // 实际实现中会使用 Adobe PDF Extract API 或 PyMuPDF
  return `从PDF提取的文本内容 (使用 ${ocrProvider})`
}

async function processWord(file: File): Promise<string> {
  // 实际实现中会使用 python-docx 或 mammoth
  return "从Word文档提取的文本内容"
}

async function processImage(file: File, ocrProvider: string): Promise<string> {
  // 实际实现中会使用 Google Vision API, Amazon Textract 等
  return `从图片识别的文本内容 (使用 ${ocrProvider})`
}
