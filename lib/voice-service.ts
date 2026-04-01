/**
 * 🎤 语音服务 - Dify 原生语音支持
 *
 * 功能：
 * 1. 录音并上传到 Dify，获取 file_id
 * 2. 调用 Dify TTS 获取音频
 */

import { getApiUrl } from "./api-config"

// Dify API Key 获取函数
const getDifyApiKey = (model?: string): string => {
  if (typeof window === "undefined") return ""

  // 根据模型获取对应的 API Key
  switch (model) {
    case "teaching-pro":
      return process.env.NEXT_PUBLIC_DIFY_TEACHING_PRO_API_KEY || ""
    case "gpt-5":
      return process.env.NEXT_PUBLIC_DIFY_API_KEY_GPT5 || ""
    case "claude-opus":
      return process.env.NEXT_PUBLIC_DIFY_API_KEY_CLAUDE || ""
    case "gemini-pro":
      return process.env.NEXT_PUBLIC_DIFY_API_KEY_GEMINI || ""
    case "grok-4.2":
      return process.env.NEXT_PUBLIC_DIFY_API_KEY_GROK42 || ""
    case "open-claw":
      return process.env.NEXT_PUBLIC_DIFY_API_KEY_OPENCLAW || ""
    default:
      return process.env.NEXT_PUBLIC_ESSAY_CORRECTION_API_KEY || process.env.NEXT_PUBLIC_DIFY_API_KEY || ""
  }
}

/**
 * 🎤 录音并上传到 Dify
 * @param audioBlob 录音数据
 * @param model 当前模型
 * @returns Dify file_id
 */
export async function uploadAudioToDify(
  audioBlob: Blob,
  model?: string
): Promise<string> {
  const apiKey = getDifyApiKey(model)

  if (!apiKey) {
    throw new Error("未配置 API Key")
  }

  const formData = new FormData()
  formData.append("file", audioBlob, "recording.webm")
  formData.append("user", "voice-user")

  const response = await fetch(getApiUrl("/api/dify-upload"), {
    method: "POST",
    headers: {
      "X-User-Id": "voice-user",
      "X-Model": model || ""
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "上传失败" }))
    throw new Error(error.error || "音频上传失败")
  }

  const data = await response.json()
  return data.id
}

/**
 * 🔊 调用 Dify TTS 获取音频 URL
 * @param text 文字内容
 * @param model 当前模型
 * @returns 音频 Blob URL
 */
export async function getDifyTTS(
  text: string,
  model?: string
): Promise<string> {
  const apiKey = getDifyApiKey(model)

  if (!apiKey) {
    throw new Error("未配置 API Key")
  }

  const response = await fetch(`https://api.shenxiang.school/v1/text-to-audio`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      user: "tts-user",
      streaming: false
    })
  })

  if (!response.ok) {
    throw new Error("TTS 请求失败")
  }

  // 将音频数据转换为 Blob URL
  const audioBlob = await response.blob()
  return URL.createObjectURL(audioBlob)
}

/**
 * 🎤 录音管理器
 */
export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null

  /**
   * 开始录音
   */
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: "audio/webm;codecs=opus"
      })
      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.start(100) // 每100ms发送一次数据
    } catch (error) {
      console.error("🎤 录音失败:", error)
      throw new Error("无法访问麦克风，请检查权限设置")
    }
  }

  /**
   * 停止录音
   * @returns 录音数据的 Blob
   */
  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("未开始录音"))
        return
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: "audio/webm" })
        this.cleanup()
        resolve(blob)
      }

      this.mediaRecorder.stop()
    })
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.audioChunks = []
  }

  /**
   * 检查是否支持录音
   */
  static isSupported(): boolean {
    return typeof window !== "undefined" &&
      (navigator.mediaDevices?.getUserMedia !== undefined ||
        navigator.getUserMedia !== undefined)
  }
}
