#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const requiredImageModels = [
  'gpt-image-2-4K',
  'banana-2',
  'gemini-3-pro-image-preview',
  'image 2电商商品图快速通道(1.5K)',
  'ecommerce-banana-2',
  'grok-imagine-image',
]

const requiredVideoModels = [
  'seedance-nsfw',
]

const retiredVideoModels = [
  'grok-video-super-720p',
  'seedance-2.0',
  'seedance-2.0-ld-17',
]

const requiredMarkers = {
  resultTtl72h: '72 * 60 * 60 * 1000',
  promptCopy: '复制提示词',
  promptClear: '清空提示词',
  openOriginal: '查看原图',
  safeWindowOpen: 'noopener,noreferrer',
  gptImage2SizeMapping: 'GPT_IMAGE_2_SIZE_BY_RESOLUTION',
  responseFormatPayload: 'responseFormat',
  geminiImageConfig: 'imageConfig',
  geminiExtraBody: 'extra_body',
  geminiAspectRatio: 'aspect_ratio',
  geminiImageSize: 'image_size',
  outputCompression: 'output_compression',
  inputFidelity: 'input_fidelity',
  videoPublicReference: 'public_reference',
  videoUpstreamReferenceUrl: 'upstream_url ||',
}

const requiredClassicOnlyMarkers = {
  mediaPromptLimitConstant: 'MEDIA_PROMPT_MAX_LENGTH = 10000',
  mediaPromptLimitProp: 'promptMaxLength={MEDIA_PROMPT_MAX_LENGTH}',
  promptTextareaMaxLength: 'maxLength={promptLimit}',
  geekImage2StableLabel: "statusLabel: '稳定'",
  geekImage2TierPriceLabel: '1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10',
  compactModelOptionLabel: 'function modelOptionDisplayLabel(model)',
}

const requiredImagePriceLabels = [
  '¥0.108/张',
  '¥0.162/张',
  '¥0.238/张',
  '¥0.055/张',
  '¥0.085/张',
]

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root')
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }
  return 'services/shenxiang-new-api/src-patch'
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function readDirectoryText(directory) {
  if (!fs.existsSync(directory)) return ''
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name))
    .map((entry) => readText(path.join(directory, entry.name)))
    .join('\n')
}

function findModels(text, regex) {
  return new Set([...text.matchAll(regex)].map((match) => match[1]))
}

function missingMarkerErrors(label, text, marker) {
  return text.includes(marker) ? [] : [`${label}: missing ${marker}`]
}

function main() {
  const sourceRoot = path.resolve(sourceRootFromArgs())
  const root = fs.existsSync(path.join(sourceRoot, 'web'))
    ? path.join(sourceRoot, 'web')
    : sourceRoot
  const classicPath = path.join(root, 'classic/src/pages/MediaPlayground/index.jsx')
  const defaultPagePath = path.join(root, 'default/src/features/media-playground/index.tsx')
  const defaultConfigPath = path.join(root, 'default/src/features/media-playground/model-config.ts')
  const defaultTypesPath = path.join(root, 'default/src/features/media-playground/types.ts')

  const errors = []
  for (const file of [classicPath, defaultPagePath, defaultConfigPath, defaultTypesPath]) {
    if (!fs.existsSync(file)) errors.push(`missing required file: ${file}`)
  }
  if (errors.length) return fail(errors)

  const classic = readText(classicPath)
  const defaultPage = readText(defaultPagePath)
  const defaultConfig = readText(defaultConfigPath)
  const defaultTypes = readText(defaultTypesPath)
  const classicComponents = readDirectoryText(
    path.join(root, 'classic/src/components/media-workbench')
  )
  const classicAll = `${classic}\n${classicComponents}`
  const defaultAll = `${defaultPage}\n${defaultConfig}\n${defaultTypes}`

  const classicModels = findModels(classic, /value:\s*['"]([^'"]+)['"]/g)
  const defaultModels = findModels(defaultConfig, /id:\s*['"]([^'"]+)['"]/g)
  const requiredModels = [...requiredImageModels, ...requiredVideoModels]

  for (const model of requiredModels) {
    if (!classicModels.has(model)) errors.push(`classic model missing: ${model}`)
    if (!defaultModels.has(model)) errors.push(`default model missing: ${model}`)
  }
  for (const model of retiredVideoModels) {
    if (classicModels.has(model)) errors.push(`classic retired model still exposed: ${model}`)
    if (defaultModels.has(model)) errors.push(`default retired model still exposed: ${model}`)
  }

  for (const [label, marker] of Object.entries(requiredMarkers)) {
    errors.push(...missingMarkerErrors(`classic marker ${label}`, classicAll, marker))
    errors.push(...missingMarkerErrors(`default marker ${label}`, defaultAll, marker))
  }
  for (const [label, marker] of Object.entries(requiredClassicOnlyMarkers)) {
    errors.push(...missingMarkerErrors(`classic marker ${label}`, classicAll, marker))
  }
  for (const marker of requiredImagePriceLabels) {
    errors.push(...missingMarkerErrors('classic image price label', classicAll, marker))
  }

  const parityPairs = [
    ['supportsInputFidelity', 'supportsInputFidelity'],
    ['supportsOutputCompression', 'supportsOutputCompression'],
    ['backgroundOptions', 'backgroundOptions'],
    ['maxCount', 'maxCount'],
    ['outputFormats', 'formats'],
    ['sizeParam', 'sizeParam'],
    ['defaultResolution', 'defaultResolution'],
    ['defaultAspectRatio', 'defaultAspectRatio'],
  ]
  for (const [defaultMarker, classicMarker] of parityPairs) {
    if (classic.includes(classicMarker) && !defaultAll.includes(defaultMarker)) {
      errors.push(
        `default missing parity marker ${JSON.stringify(defaultMarker)} present in classic as ${JSON.stringify(classicMarker)}`
      )
    }
  }

  const requiredModelSet = new Set(requiredModels)
  const classicOnly = [...classicModels]
    .filter((model) => requiredModelSet.has(model) && !defaultModels.has(model))
    .sort()
  const defaultOnly = [...defaultModels]
    .filter((model) => requiredModelSet.has(model) && !classicModels.has(model))
    .sort()
  if (classicOnly.length) errors.push(`models only in classic: ${classicOnly.join(', ')}`)
  if (defaultOnly.length) errors.push(`models only in default: ${defaultOnly.join(', ')}`)

  if (errors.length) return fail(errors)
  console.log('media playground theme parity check passed')
}

function fail(errors) {
  console.error('media playground theme parity check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

main()
