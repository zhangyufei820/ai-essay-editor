'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getImageModelConfig } from '@/components/chat/image-generation/config'
import { ImageGenerationEntry } from '@/components/chat/image-generation/image-generation-entry'
import { buildImageChatRoute } from '@/components/chat/image-generation/navigation'

export default function CreativeImageGpt2Page() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const config = useMemo(() => getImageModelConfig('gpt-image-2'), [])
  const [prompt, setPrompt] = useState('')
  const [selectedModeKey, setSelectedModeKey] = useState(config.defaultModeKey)
  const [selectedSizeValue, setSelectedSizeValue] = useState(config.defaultSizeValue)
  const [uploadedFileCount, setUploadedFileCount] = useState(0)

  return (
    <>
      <ImageGenerationEntry
        title={config.title}
        prompt={prompt}
        onPromptChange={setPrompt}
        modes={config.modes}
        selectedModeKey={selectedModeKey}
        onModeChange={(modeKey: string) => setSelectedModeKey(modeKey as "text-to-image" | "image-edit")}
        sizeOptions={config.sizeOptions}
        selectedSizeValue={selectedSizeValue}
        onSizeChange={setSelectedSizeValue}
        uploadedFileCount={uploadedFileCount}
        onUploadClick={() => fileInputRef.current?.click()}
        ctaLabel={selectedModeKey === 'image-edit' ? '开始编辑' : config.ctaLabel}
        onSubmit={() => {
          router.push(
            buildImageChatRoute(config.chatRoute, {
              prompt,
              mode: selectedModeKey,
              size: selectedSizeValue,
              fileCount: uploadedFileCount,
            })
          )
        }}
        isSubmitting={false}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => setUploadedFileCount(event.target.files?.length ?? 0)}
      />
    </>
  )
}
