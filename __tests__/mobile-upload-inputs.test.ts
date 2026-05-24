import { readFileSync } from "fs"
import path from "path"

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8")

describe("mobile upload entry points", () => {
  it("uses label-driven file pickers instead of hidden programmatic clicks", () => {
    const surfaces = [
      "components/chat/ChatInput.tsx",
      "components/essay-grader.tsx",
      "components/chat/gpt-image2-chat-interface.tsx",
      "components/video/VideoGenerationPage.tsx",
      "components/worksheet-diagnosis-app.tsx",
      "components/worksheet-diagnosis/v2/DiagnosisPageV2.tsx",
      "app/tools/page.tsx",
      "app/settings/page.tsx",
    ]

    for (const file of surfaces) {
      const source = read(file)
      expect(`${file}\n${source}`).toContain("sx-file-input")
      expect(`${file}\n${source}`).not.toMatch(/type="file"[\s\S]{0,180}className="hidden"/)
    }
  })

  it("keeps the chat mobile tool cluster collapsed so the input remains wide", () => {
    const source = read("components/chat/ChatInput.tsx")

    expect(source).toContain("mobileToolsOpen")
    expect(source).toContain('aria-label={mobileToolsOpen ? "收起输入工具" : "展开输入工具"}')
    expect(source).toContain('htmlFor={uploadInputId}')
    expect(source).toContain('htmlFor={cameraInputId}')
    expect(source).toContain("上传文件")
    expect(source).toContain("拍照/相册")
  })
})
