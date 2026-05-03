import http from "node:http"

const PORT = Number(process.env.PORT || 8080)
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
const TTS_PROVIDER = (process.env.VOICE_TTS_PROVIDER || "openai").toLowerCase()
const STT_PROVIDER = (process.env.VOICE_STT_PROVIDER || "openai").toLowerCase()
const TTS_MODEL = process.env.VOICE_TTS_MODEL || "gpt-4o-mini-tts"
const STT_MODEL = process.env.VOICE_STT_MODEL || "gpt-4o-mini-transcribe"
const DEFAULT_VOICE = process.env.VOICE_TTS_VOICE || "coral"
const MAX_TTS_CHARS = Number(process.env.VOICE_MAX_TTS_CHARS || 600)
const MAX_AUDIO_BYTES = Number(process.env.VOICE_MAX_AUDIO_BYTES || 25 * 1024 * 1024)
const MINIMAX_BASE_URL = (process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/+$/, "")
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || ""
const MINIMAX_TTS_MODEL = process.env.MINIMAX_TTS_MODEL || "speech-2.8-turbo"
const MINIMAX_VOICE_ID = process.env.MINIMAX_VOICE_ID || "English_expressive_narrator"
const SILICONFLOW_BASE_URL = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/+$/, "")
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || ""
const SILICONFLOW_TTS_MODEL_CONFIG = process.env.SILICONFLOW_TTS_MODEL || "FunAudioLLM/CosyVoice2-0.5B:diana"
const SILICONFLOW_TTS_MODEL = SILICONFLOW_TTS_MODEL_CONFIG.includes(":")
  ? SILICONFLOW_TTS_MODEL_CONFIG.split(":")[0]
  : SILICONFLOW_TTS_MODEL_CONFIG
const SILICONFLOW_TTS_VOICE = process.env.SILICONFLOW_TTS_VOICE
  || (SILICONFLOW_TTS_MODEL_CONFIG.includes(":")
    ? SILICONFLOW_TTS_MODEL_CONFIG
    : `${SILICONFLOW_TTS_MODEL}:diana`)
const SILICONFLOW_STT_MODEL = process.env.SILICONFLOW_STT_MODEL || "FunAudioLLM/SenseVoiceSmall"

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "video/webm",
])

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) {
        req.destroy(new Error("JSON body too large"))
      }
    })
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function toWebRequest(req) {
  const url = `http://voice-gateway${req.url || "/"}`
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half",
  })
}

function normalizeFormat(format) {
  const value = typeof format === "string" ? format.toLowerCase() : "mp3"
  return ["mp3", "opus", "aac", "flac", "wav", "pcm"].includes(value) ? value : "mp3"
}

function normalizeLanguage(language) {
  const value = typeof language === "string" ? language.trim() : "en"
  return value || "en"
}

function providerConfigured(kind) {
  if (kind === "tts" && TTS_PROVIDER === "minimax") return Boolean(MINIMAX_API_KEY)
  if (kind === "tts" && TTS_PROVIDER === "siliconflow") return Boolean(SILICONFLOW_API_KEY)
  if (kind === "stt" && STT_PROVIDER === "siliconflow") return Boolean(SILICONFLOW_API_KEY)
  return Boolean(OPENAI_API_KEY)
}

function assertConfigured(kind) {
  if (!providerConfigured(kind)) {
    const provider = kind === "tts" ? TTS_PROVIDER : STT_PROVIDER
    const error = new Error(`${provider.toUpperCase()} ${kind.toUpperCase()} provider is not configured`)
    error.status = 503
    throw error
  }
}

async function openaiTts({ input, responseFormat, voice, instructions }) {
  const upstream = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input,
      instructions,
      response_format: responseFormat,
    }),
  })

  if (!upstream.ok) {
    const errorText = await upstream.text()
    const error = new Error("TTS provider request failed")
    error.status = upstream.status
    error.details = errorText.slice(0, 500)
    throw error
  }

  const audio = Buffer.from(await upstream.arrayBuffer())
  const contentType = upstream.headers.get("content-type") || (responseFormat === "wav" ? "audio/wav" : "audio/mpeg")
  return { audio, contentType }
}

async function minimaxTts({ input, responseFormat, voice }) {
  const audioFormat = responseFormat === "wav" ? "wav" : responseFormat === "flac" ? "flac" : "mp3"
  const upstream = await fetch(`${MINIMAX_BASE_URL}/t2a_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MINIMAX_TTS_MODEL,
      text: input,
      stream: false,
      language_boost: "English",
      output_format: "hex",
      voice_setting: {
        voice_id: voice && voice !== "coral" ? voice : MINIMAX_VOICE_ID,
        speed: 0.85,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: audioFormat,
        channel: 1,
      },
    }),
  })

  const payload = await upstream.json().catch(async () => ({ raw: await upstream.text().catch(() => "") }))
  if (!upstream.ok || payload?.base_resp?.status_code) {
    const error = new Error("TTS provider request failed")
    error.status = upstream.ok ? 502 : upstream.status
    error.details = payload
    throw error
  }

  const hexAudio = payload?.data?.audio
  if (typeof hexAudio !== "string" || !hexAudio) {
    const error = new Error("MiniMax TTS response did not include audio")
    error.status = 502
    error.details = payload
    throw error
  }

  return {
    audio: Buffer.from(hexAudio, "hex"),
    contentType: audioFormat === "wav" ? "audio/wav" : audioFormat === "flac" ? "audio/flac" : "audio/mpeg",
  }
}

async function siliconflowTts({ input, responseFormat, voice }) {
  const siliconflowVoice = voice && voice !== "coral" ? voice : SILICONFLOW_TTS_VOICE
  const upstream = await fetch(`${SILICONFLOW_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SILICONFLOW_TTS_MODEL,
      voice: siliconflowVoice,
      input,
      response_format: responseFormat,
    }),
  })

  const contentType = upstream.headers.get("content-type") || ""
  if (!upstream.ok) {
    const errorPayload = contentType.includes("application/json")
      ? await upstream.json().catch(() => ({}))
      : await upstream.text().catch(() => "")
    const error = new Error("TTS provider request failed")
    error.status = upstream.status
    error.details = typeof errorPayload === "string" ? errorPayload.slice(0, 500) : errorPayload
    throw error
  }

  if (contentType.startsWith("audio/") || contentType === "application/octet-stream") {
    const audio = Buffer.from(await upstream.arrayBuffer())
    return {
      audio,
      contentType: contentType || (responseFormat === "wav" ? "audio/wav" : "audio/mpeg"),
    }
  }

  const payload = await upstream.json().catch(async () => ({ raw: await upstream.text().catch(() => "") }))
  const audioBase64 =
    payload?.data?.audio ||
    payload?.audio ||
    payload?.b64_json

  if (typeof audioBase64 === "string" && audioBase64) {
    return {
      audio: Buffer.from(audioBase64, "base64"),
      contentType: responseFormat === "wav" ? "audio/wav" : "audio/mpeg",
    }
  }

  const error = new Error("SiliconFlow TTS response did not include audio")
  error.status = 502
  error.details = payload
  throw error
}

async function handleTts(req, res) {
  assertConfigured("tts")

  const body = await readJson(req)
  const text = typeof body.text === "string" ? body.text.trim() : ""
  if (!text) return json(res, 400, { error: "text is required" })

  const input = text.slice(0, MAX_TTS_CHARS)
  const responseFormat = normalizeFormat(body.format)
  const voice = typeof body.voice === "string" && body.voice.trim() ? body.voice.trim() : DEFAULT_VOICE
  const instructions = typeof body.instructions === "string" && body.instructions.trim()
    ? body.instructions.trim().slice(0, 600)
    : "Speak slowly and clearly in standard English pronunciation for a language learner."

  const result = TTS_PROVIDER === "minimax"
    ? await minimaxTts({ input, responseFormat, voice, instructions })
    : TTS_PROVIDER === "siliconflow"
      ? await siliconflowTts({ input, responseFormat, voice, instructions })
      : await openaiTts({ input, responseFormat, voice, instructions })

  res.writeHead(200, {
    "Content-Type": result.contentType,
    "Content-Length": result.audio.byteLength,
    "Cache-Control": "public, max-age=86400",
  })
  res.end(result.audio)
}

async function transcribeWithOpenAICompatible({ baseUrl, apiKey, model, file, language, prompt }) {
  const providerForm = new FormData()
  providerForm.append("model", model)
  providerForm.append("file", file, file.name || "recording.webm")
  providerForm.append("language", language)

  if (typeof prompt === "string" && prompt.trim()) {
    providerForm.append("prompt", prompt.trim().slice(0, 400))
  }

  const upstream = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: providerForm,
  })

  const payload = await upstream.json().catch(async () => ({ raw: await upstream.text().catch(() => "") }))
  if (!upstream.ok) {
    const error = new Error("STT provider request failed")
    error.status = upstream.status
    error.details = payload
    throw error
  }

  return {
    text: typeof payload.text === "string" ? payload.text : "",
    model,
  }
}

async function handleStt(req, res) {
  assertConfigured("stt")

  const contentLength = Number(req.headers["content-length"] || 0)
  if (contentLength > MAX_AUDIO_BYTES) {
    return json(res, 413, { error: "audio file too large" })
  }

  const formData = await toWebRequest(req).formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return json(res, 400, { error: "file is required" })
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return json(res, 413, { error: "audio file too large" })
  }
  if (file.type && !ALLOWED_AUDIO_TYPES.has(file.type)) {
    return json(res, 400, { error: `unsupported audio type: ${file.type}` })
  }

  const language = normalizeLanguage(formData.get("language"))
  const prompt = formData.get("prompt")
  const result = STT_PROVIDER === "siliconflow"
    ? await transcribeWithOpenAICompatible({
        baseUrl: SILICONFLOW_BASE_URL,
        apiKey: SILICONFLOW_API_KEY,
        model: SILICONFLOW_STT_MODEL,
        file,
        language,
        prompt,
      })
    : await transcribeWithOpenAICompatible({
        baseUrl: OPENAI_BASE_URL,
        apiKey: OPENAI_API_KEY,
        model: STT_MODEL,
        file,
        language,
        prompt,
      })

  return json(res, 200, result)
}

async function route(req, res) {
  try {
    if (req.method === "GET" && req.url === "/voice/health") {
      return json(res, 200, {
        status: "ok",
        ttsProvider: TTS_PROVIDER,
        sttProvider: STT_PROVIDER,
        ttsModel: TTS_PROVIDER === "minimax" ? MINIMAX_TTS_MODEL : TTS_PROVIDER === "siliconflow" ? SILICONFLOW_TTS_MODEL : TTS_MODEL,
        ttsVoice: TTS_PROVIDER === "siliconflow" ? SILICONFLOW_TTS_VOICE : TTS_PROVIDER === "minimax" ? MINIMAX_VOICE_ID : DEFAULT_VOICE,
        sttModel: STT_PROVIDER === "siliconflow" ? SILICONFLOW_STT_MODEL : STT_MODEL,
        ttsProviderConfigured: providerConfigured("tts"),
        sttProviderConfigured: providerConfigured("stt"),
      })
    }

    if (req.method === "POST" && req.url === "/voice/tts") return await handleTts(req, res)
    if (req.method === "POST" && req.url === "/voice/stt") return await handleStt(req, res)

    return json(res, 404, { error: "not found" })
  } catch (error) {
    const status = Number(error?.status || 500)
    console.error("[voice-gateway]", error)
    return json(res, status, {
      error: status === 500 ? "voice gateway internal error" : error.message,
      details: error?.details,
    })
  }
}

http.createServer(route).listen(PORT, "0.0.0.0", () => {
  console.log(`voice-gateway listening on ${PORT}`)
})
