import fs from "fs"
import os from "os"
import path from "path"

import { buildLocalFileResponse, parseByteRange } from "@/lib/local-file-response"

describe("local file streaming responses", () => {
  let directory = ""
  let filePath = ""

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "shenxiang-file-response-"))
    filePath = path.join(directory, "sample.bin")
    fs.writeFileSync(filePath, Buffer.from("0123456789"))
  })

  afterAll(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it("parses bounded and suffix byte ranges", () => {
    expect(parseByteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 })
    expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 })
    expect(parseByteRange("bytes=20-30", 10)).toBeNull()
    expect(parseByteRange("bytes=0-1,4-5", 10)).toBeNull()
  })

  it("streams a requested range with RFC-compatible headers", async () => {
    const response = await buildLocalFileResponse({
      filePath,
      contentType: "application/octet-stream",
      rangeHeader: "bytes=2-5",
      maxBytes: 100,
    })

    expect(response.status).toBe(206)
    expect(response.headers.get("Accept-Ranges")).toBe("bytes")
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10")
    expect(response.headers.get("Content-Length")).toBe("4")
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("2345")
  })

  it("rejects oversized files before opening a response stream", async () => {
    const response = await buildLocalFileResponse({
      filePath,
      contentType: "application/octet-stream",
      maxBytes: 5,
    })

    expect(response.status).toBe(413)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("returns private 404 and 416 responses", async () => {
    const missing = await buildLocalFileResponse({
      filePath: path.join(directory, "missing.bin"),
      contentType: "application/octet-stream",
      maxBytes: 100,
    })
    const invalidRange = await buildLocalFileResponse({
      filePath,
      contentType: "application/octet-stream",
      rangeHeader: "bytes=20-30",
      maxBytes: 100,
    })

    expect(missing.status).toBe(404)
    expect(invalidRange.status).toBe(416)
    expect(invalidRange.headers.get("Content-Range")).toBe("bytes */10")
    expect(invalidRange.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("serves empty files without opening a stream", async () => {
    const emptyPath = path.join(directory, "empty.bin")
    fs.writeFileSync(emptyPath, Buffer.alloc(0))

    const response = await buildLocalFileResponse({
      filePath: emptyPath,
      contentType: "application/octet-stream",
      maxBytes: 100,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Length")).toBe("0")
    expect(await response.text()).toBe("")
  })

  it("rejects malformed and impossible range forms", () => {
    expect(parseByteRange("items=0-1", 10)).toBeNull()
    expect(parseByteRange("bytes=-0", 10)).toBeNull()
    expect(parseByteRange("bytes=5-2", 10)).toBeNull()
    expect(parseByteRange("bytes=-", 10)).toBeNull()
    expect(parseByteRange("bytes=2-", 10)).toEqual({ start: 2, end: 9 })
  })
})
