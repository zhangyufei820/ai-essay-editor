import { GptImage2ChatInterface } from "@/components/chat/gpt-image2-chat-interface"

export default function CreativeImageGeminiPage() {
  return (
    <main className="min-h-screen">
      <GptImage2ChatInterface workspaceModel="gemini-image" />
    </main>
  )
}
