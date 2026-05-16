/**
 * 🎤 语音服务 - 服务器端语音网关
 *
 * 功能：
 * 1. 录音并通过语音网关转写文本
 * 2. 调用语音网关 TTS 获取音频
 */

import { getApiUrl } from "./api-config"
import { getVerifiedAuthHeaders } from "./client-auth"

/**
 * 🎤 录音并通过语音网关识别
 * @param audioBlob 录音数据
 * @param target 可选目标词/句，帮助识别
 * @returns 识别文本
 */
export async function transcribeAudio(
  audioBlob: Blob,
  target?: string
): Promise<string> {
  const formData = new FormData()
  formData.append("file", audioBlob, "recording.webm")
  formData.append("language", "en")
  if (target?.trim()) formData.append("target", target.trim())

  const response = await fetch(getApiUrl("/api/voice/stt"), {
    method: "POST",
    headers: await getVerifiedAuthHeaders(),
    body: formData
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "语音识别失败" }))
    throw new Error(error.error || "语音识别失败")
  }

  const data = await response.json()
  return typeof data.text === "string" ? data.text : ""
}

export const uploadAudioToDify = transcribeAudio

/**
 * 🔊 调用 TTS API 获取音频 URL
 * @param text 文字内容
 * @param model 当前模型
 * @returns 音频 Blob URL
 */
export async function getDifyTTS(
  text: string,
  model?: string
): Promise<string> {
  try {
    // 使用服务器端语音网关代理
    const response = await fetch(getApiUrl("/api/voice/tts"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getVerifiedAuthHeaders()),
      },
      body: JSON.stringify({ text, model, format: "mp3" })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "TTS 请求失败" }))
      if (response.status === 501 || error.code === "TTS_NOT_ENABLED") {
        throw new Error("当前模型未开启语音朗读")
      }

      throw new Error(error.error || "TTS 请求失败")
    }

    // 将音频数据转换为 Blob URL
    const audioBlob = await response.blob()
    return URL.createObjectURL(audioBlob)
  } catch (error) {
    console.error("🔊 [TTS] 错误:", error)
    throw error
  }
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
      navigator.mediaDevices?.getUserMedia !== undefined
  }
}
