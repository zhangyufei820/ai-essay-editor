import { readFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

export const runtime = "nodejs"
export const dynamic = "force-static"

export async function GET() {
  const icon = await readFile(path.join(process.cwd(), "public", "icon.svg"))
  const png = await sharp(icon).resize(180, 180, { fit: "contain" }).png().toBuffer()

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  })
}
