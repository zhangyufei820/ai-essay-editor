import { createReadStream } from "fs"
import { promises as fs } from "fs"
import { Readable } from "stream"

type ByteRange = {
  start: number
  end: number
}

type LocalFileResponseOptions = {
  filePath: string
  contentType: string
  maxBytes: number
  rangeHeader?: string | null
  headers?: HeadersInit
}

export function parseByteRange(rangeHeader: string, fileSize: number): ByteRange | null {
  if (!/^bytes=\d*-\d*$/.test(rangeHeader) || rangeHeader.includes(",") || fileSize <= 0) {
    return null
  }

  const [startValue, endValue] = rangeHeader.slice("bytes=".length).split("-", 2)
  if (!startValue && !endValue) return null

  if (!startValue) {
    const suffixLength = Number(endValue)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    }
  }

  const start = Number(startValue)
  const requestedEnd = endValue ? Number(endValue) : fileSize - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return null
  }

  return { start, end: Math.min(requestedEnd, fileSize - 1) }
}

function privateError(message: string, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set("Cache-Control", "private, no-store")
  responseHeaders.set("X-Content-Type-Options", "nosniff")
  return new Response(message, { status, headers: responseHeaders })
}

export async function buildLocalFileResponse(options: LocalFileResponseOptions) {
  let stat
  try {
    stat = await fs.stat(/* turbopackIgnore: true */ options.filePath)
  } catch {
    return privateError("Not Found", 404, options.headers)
  }

  if (!stat.isFile()) return privateError("Not Found", 404, options.headers)
  if (stat.size > options.maxBytes) return privateError("File Too Large", 413, options.headers)

  const headers = new Headers(options.headers)
  headers.set("Content-Type", options.contentType)
  headers.set("Accept-Ranges", "bytes")
  headers.set("X-Content-Type-Options", "nosniff")

  let status = 200
  let start = 0
  let end = Math.max(0, stat.size - 1)

  if (options.rangeHeader) {
    const range = parseByteRange(options.rangeHeader, stat.size)
    if (!range) {
      headers.set("Content-Range", `bytes */${stat.size}`)
      return privateError("Range Not Satisfiable", 416, headers)
    }
    start = range.start
    end = range.end
    status = 206
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`)
  }

  const contentLength = stat.size === 0 ? 0 : end - start + 1
  headers.set("Content-Length", String(contentLength))

  if (stat.size === 0) {
    return new Response(null, { status, headers })
  }

  const nodeStream = createReadStream(/* turbopackIgnore: true */ options.filePath, { start, end })
  const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
  return new Response(body, { status, headers })
}
