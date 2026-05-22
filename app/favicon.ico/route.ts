import { readFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-static"

export async function GET() {
  const icon = await readFile(path.join(process.cwd(), "public", "icon.svg"))

  return new Response(new Uint8Array(icon), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  })
}
