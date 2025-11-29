import { type NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json()

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 })
    }

    console.log(`[v0] OCR: Processing ${images.length} images`)

    const apiKey = process.env.VIVA_API_KEY || "sk-diaycftqfopXhIAf5gm7G35xSndFo0VzMi0PyRpHQGz4voxG"
    const baseURL = "https://www.vivaapi.cn/v1"

    const ocrMessages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "请识别图片中的所有文字，直接输出文字内容，不要添加任何说明或格式。",
          },
          ...images.map((img: string) => ({
            type: "image_url",
            image_url: {
              url: img,
            },
          })),
        ],
      },
    ]

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: ocrMessages,
        temperature: 0.1,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] OCR API error:", errorText)
      return NextResponse.json({ error: `OCR failed: ${response.status}` }, { status: response.status })
    }

    const data = await response.json()
    const extractedText = data.choices[0].message.content

    console.log(`[v0] OCR: Extracted ${extractedText.length} characters`)

    return NextResponse.json({ text: extractedText })
  } catch (error) {
    console.error("[v0] OCR error:", error)
    return NextResponse.json({ error: "OCR processing failed" }, { status: 500 })
  }
}
