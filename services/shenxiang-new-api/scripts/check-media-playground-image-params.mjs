#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

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

function markerErrors(label, text, markers) {
  return markers
    .filter((marker) => !text.includes(marker))
    .map((marker) => `${label}: missing ${marker}`)
}

function modelBlock(text, model) {
  const marker = `value: '${model}'`
  const start = text.indexOf(marker)
  if (start === -1) return ''
  const end = text.indexOf('\n  },', start)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

function arrayBlock(text, name) {
  const marker = `const ${name} = [`
  const start = text.indexOf(marker)
  if (start === -1) return ''
  const end = text.indexOf('\n];', start)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

function functionBlock(text, name) {
  const marker = `function ${name}(`
  const start = text.indexOf(marker)
  if (start === -1) return ''
  const end = text.indexOf('\n}', start)
  return end === -1 ? text.slice(start) : text.slice(start, end + 2)
}

async function main() {
  const sourceRoot = path.resolve(sourceRootFromArgs())
  const root = fs.existsSync(path.join(sourceRoot, 'web'))
    ? path.join(sourceRoot, 'web')
    : sourceRoot
  const classicPath = path.join(root, 'classic/src/pages/MediaPlayground/index.jsx')
  const imageAspectRatioPath = path.join(
    root,
    'classic/src/pages/MediaPlayground/image-aspect-ratio.js',
  )
  const contractPath = path.resolve(scriptDir, '../release/image-model-contract.json')
  const openAIAdaptorPath = path.join(sourceRoot, 'relay/channel/openai/adaptor.go')
  const taskControllerPath = path.join(sourceRoot, 'controller/playground_image_task.go')

  if (!fs.existsSync(classicPath)) {
    return fail([`missing required file: ${classicPath}`])
  }
  if (!fs.existsSync(imageAspectRatioPath)) {
    return fail([`missing required file: ${imageAspectRatioPath}`])
  }
  for (const requiredPath of [contractPath, openAIAdaptorPath, taskControllerPath]) {
    if (!fs.existsSync(requiredPath)) {
      return fail([`missing required file: ${requiredPath}`])
    }
  }

  const classic = readText(classicPath)
  const openAIAdaptor = readText(openAIAdaptorPath)
  const taskController = readText(taskControllerPath)
  const imageModelContract = JSON.parse(readText(contractPath))
  const { closestSupportedImageAspectRatio } = await import(
    `${pathToFileURL(imageAspectRatioPath).href}?mtime=${fs.statSync(imageAspectRatioPath).mtimeMs}`
  )
  const gptImage2Block = modelBlock(classic, 'gpt-image-2-4K')
  const stableImage2Block = modelBlock(classic, '官转image 2稳定')
  const discountImage2Block = modelBlock(classic, '特价 image-2')
  const banana2Block = modelBlock(classic, 'banana-2')
  const geminiProBlock = modelBlock(classic, 'gemini-3-pro-image-preview')
  const geminiFlashDDPAPIBlock = modelBlock(classic, 'gemini-3.1-flash-image')
  const geminiProDDPAPIBlock = modelBlock(classic, 'gemini-3-pro-image')
  const grokBlock = modelBlock(classic, 'grok-imagine-image')
  const grokRatioBlock = arrayBlock(classic, 'XAI_GROK_IMAGE_ASPECT_RATIOS')
  const grok46Block = modelBlock(classic, 'grok 4.6图片')
  const grok46RatioBlock = arrayBlock(classic, 'XAI_GROK_46_IMAGE_ASPECT_RATIOS')
  const gptImage25FlareBlock = modelBlock(classic, 'gpt-image-2.5-flare')
  const gptImage25SunburstBlock = modelBlock(classic, 'gpt-image-2.5-sunburst')
  const errors = []

  if (imageModelContract.schema_version !== 1 || !Array.isArray(imageModelContract.models)) {
    errors.push('image model contract must use schema_version 1 with a models array')
  } else {
    const imageModelsBlock = arrayBlock(classic, 'IMAGE_MODELS')
    const actualModelIds = [...imageModelsBlock.matchAll(/\bvalue:\s*'([^']+)'/g)].map(
      (match) => match[1],
    )
    const expectedModelIds = imageModelContract.models.map((model) => model.id)
    if (JSON.stringify(actualModelIds) !== JSON.stringify(expectedModelIds)) {
      errors.push(
        `classic image model catalog drift: expected ${JSON.stringify(expectedModelIds)}, got ${JSON.stringify(actualModelIds)}`,
      )
    }

    const familyHelpers = {
      'gpt-image-2': functionBlock(classic, 'isGptImage2Model'),
      'gpt-image-2.5': functionBlock(classic, 'isGptImage25Model'),
      gemini: functionBlock(classic, 'isGeminiImageModel'),
      grok: functionBlock(classic, 'isGrokImageModel'),
    }
    for (const model of imageModelContract.models) {
      const block = modelBlock(classic, model.id)
      if (!block) {
        errors.push(`classic image model catalog missing ${model.id}`)
        continue
      }
      if (!block.includes(`edit: ${model.edit}`)) {
        errors.push(`${model.id} edit capability drifted from release contract`)
      }
      if (!block.includes(`maxCount: ${model.max_count}`)) {
        errors.push(`${model.id} maxCount drifted from release contract`)
      }
      if (!familyHelpers[model.family]?.includes(`'${model.id}'`)) {
        errors.push(`${model.id} is missing from ${model.family} request routing helper`)
      }
    }
  }

  for (const [referenceRatio, supportedRatios, expectedRatio] of [
    ['3024:4032', ['1:1', '3:4', '4:3'], '3:4'],
    ['3024:4031', ['1:1', '3:4', '4:3'], '3:4'],
    ['4032:3023', ['1:1', '3:4', '4:3'], '4:3'],
    ['', ['1:1', '3:4', '4:3'], ''],
  ]) {
    const actualRatio = closestSupportedImageAspectRatio(referenceRatio, supportedRatios)
    if (actualRatio !== expectedRatio) {
      errors.push(
        `automatic edit ratio ${referenceRatio || '<empty>'}: expected ${expectedRatio || '<empty>'}, got ${actualRatio || '<empty>'}`,
      )
    }
  }

  errors.push(
    ...markerErrors('Automatic image-edit ratio submission', classic, [
      "import { closestSupportedImageAspectRatio } from './image-aspect-ratio';",
      "aspectRatio === 'auto' && imageWorkflow === 'edit'",
      "let detectedRatio = '';",
      'detectedRatio = await imageAspectRatioFromFile',
      '无法识别参考图比例，请重新上传图片后再试。',
    ]),
  )
  if (classic.includes('let detectedRatio = referenceImageAspectRatio;')) {
    errors.push('automatic image-edit submission must not reuse stale aspect-ratio state')
  }

  errors.push(
    ...markerErrors('Gemini Pro official aspect ratios', classic, [
      'const GOOGLE_GEMINI_PRO_IMAGE_ASPECT_RATIOS = [',
      "'21:9',",
      'const GOOGLE_GEMINI_PRO_IMAGE_SIZE_BY_RESOLUTION = {',
      "'16:9': '5504x3072'",
      "'9:16': '3072x5504'",
      "'21:9': '6336x2688'",
    ]),
  )

  errors.push(
    ...markerErrors('Gemini 3.1 Flash resolutions', classic, [
      "const GOOGLE_GEMINI_31_FLASH_IMAGE_RESOLUTIONS = ['512', '1K', '2K', '4K']",
      'resolutions: GOOGLE_GEMINI_31_FLASH_IMAGE_RESOLUTIONS',
    ]),
  )

  errors.push(
    ...markerErrors('GPT Image 2 official size constraints', classic, [
      "const GPT_IMAGE_2_RESOLUTIONS = ['auto', '1K', '2K', '4K', 'custom']",
      "'16:9': '3840x2160'",
      "'9:16': '2160x3840'",
      'const GPT_IMAGE_2_MIN_PIXELS = 655360',
      'const GPT_IMAGE_2_MAX_PIXELS = 8294400',
      'const GPT_IMAGE_2_MAX_SIDE = 3840',
      'function gptImage2CustomSizeError(value)',
      'data-xr-agent=\'media-custom-size\'',
      '最大边 3840',
      '3840x2160 / 2160x3840',
    ]),
  )

  errors.push(
    ...markerErrors('Grok official ratio and resolution controls', classic, [
      'const XAI_GROK_IMAGE_REQUEST_SIZE_BY_ASPECT_RATIO = {',
      "'1:1': '1024x1024'",
      "'2:3': '768x1152'",
      'const XAI_GROK_IMAGE_OUTPUT_SIZE_BY_ASPECT_RATIO = {',
      "'1:1': '960x960'",
      "'9:16': '720x1280'",
      "'16:9': '1280x720'",
      'sizes: XAI_GROK_IMAGE_ASPECT_RATIOS',
      "resolutions: ['1k']",
      "defaultResolution: '1k'",
      '当前供应商实际仅返回约 1K',
      'payload.size = grokImageRequestSizeFor(effectiveAspectRatio)',
    ]),
  )

  if (!grokBlock.includes('edit: false') || !grokBlock.includes('仅支持文生图')) {
    errors.push('Grok Image Pro must remain text-to-image only')
  }

  if (grokBlock.includes("'2k'")) {
    errors.push('Grok Image Pro must not expose unverified 2k output')
  }

  for (const unsupportedRatio of ["'auto'", "'2:1'", "'3:2'", "'20:9'", "'9:20'"]) {
    if (grokRatioBlock.includes(unsupportedRatio)) {
      errors.push(`Grok Image Pro must not expose unverified ratio ${unsupportedRatio}`)
    }
  }

  if (!grokBlock.includes("priceLabel: '¥0.055/张'")) {
    errors.push('Grok Image Pro must show ¥0.055 fixed price')
  }

  if (!grok46Block) {
    errors.push('classic media playground must expose public model grok 4.6图片')
  } else {
    for (const marker of [
      "resolutions: ['1k', '2k']",
      "qualities: ['low', 'medium']",
      'maxCount: 10',
      "sizeParam: 'aspect_ratio'",
      'edit: false',
      "priceLabel: '¥0.10/张'",
      '仅支持文生图',
    ]) {
      if (!grok46Block.includes(marker)) {
        errors.push(`grok 4.6图片 missing official contract marker: ${marker}`)
      }
    }
  }
  for (const ratio of ["'2:1'", "'1:2'", "'20:9'", "'9:20'"]) {
    if (!grok46RatioBlock.includes(ratio)) {
      errors.push(`grok 4.6图片 missing official ratio ${ratio}`)
    }
  }
  for (const marker of [
    "function isGrok46ImageModel(model)",
    "if (!isGrok46ImageModel(imageModel))",
    "if (isGrok46ImageModel(imageModel) && quality) payload.quality = quality",
  ]) {
    if (!classic.includes(marker)) {
      errors.push(`grok 4.6图片 payload guard missing marker: ${marker}`)
    }
  }

  errors.push(
    ...markerErrors('Visible pixel output spec', classic, [
      'function imagePixelSizeForModel(modelValue, aspectRatio, imageSize, customSize',
      'const imagePixelLabel =',
      'imagePixelLabel,',
    ]),
  )

  if (geminiProBlock.includes('aspectRatios: GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS')) {
    errors.push('Gemini Pro must not use Gemini 3.1 Flash extreme aspect ratio set')
  }

  for (const [label, block, ratioMarker, priceMarker] of [
    ['gemini-3.1-flash-image', geminiFlashDDPAPIBlock, 'GOOGLE_GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS', "priceLabel: '¥0.10/张'"],
    ['gemini-3-pro-image', geminiProDDPAPIBlock, 'GOOGLE_GEMINI_PRO_IMAGE_ASPECT_RATIOS', "priceLabel: '¥0.15/张'"],
  ]) {
    if (!block) {
      errors.push(`classic media playground must expose ${label}`)
      continue
    }
    for (const marker of [
      `sizes: ${ratioMarker}`,
      "resolutions: ['1K', '2K', '4K']",
      'maxCount: 1',
      'edit: true',
      priceMarker,
    ]) {
      if (!block.includes(marker)) errors.push(`${label} missing contract marker: ${marker}`)
    }
  }

  if (!gptImage2Block.includes('resolutions: GPT_IMAGE_2_RESOLUTIONS')) {
    errors.push('gpt-image-2-4K must use GPT_IMAGE_2_RESOLUTIONS')
  }

  for (const [label, block, priceLabel] of [
    ['gpt-image-2.5-flare', gptImage25FlareBlock, "priceLabel: '¥0.34992/张'"],
    ['gpt-image-2.5-sunburst', gptImage25SunburstBlock, "priceLabel: '¥0.42768/张'"],
  ]) {
    if (!block) {
      errors.push(`classic media playground must expose ${label}`)
      continue
    }
    for (const marker of [
      'sizes: GPT_IMAGE_25_ASPECT_RATIOS',
      'aspectRatios: GPT_IMAGE_25_ASPECT_RATIOS',
      'resolutions: GPT_IMAGE_2_RESOLUTIONS',
      "qualities: ['auto', 'low', 'medium', 'high', 'xhigh', 'max']",
      "formats: ['png', 'jpeg', 'webp']",
      "backgroundOptions: ['auto', 'opaque', 'transparent']",
      'supportsInputFidelity: true',
      'supportsOutputCompression: true',
      'maxCount: 1',
      'edit: true',
      priceLabel,
      '支持 1K / 2K / 4K、合法自定义 WxH',
      '参考图编辑',
    ]) {
      if (!block.includes(marker)) errors.push(`${label} missing official contract marker: ${marker}`)
    }
  }
  for (const [label, block, badge, positioning] of [
    ['gpt-image-2.5-flare', gptImage25FlareBlock, "badge: '快速生成'", '最快的高质量日常图像生成'],
    ['gpt-image-2.5-sunburst', gptImage25SunburstBlock, "badge: '精细编辑'", '编辑精度与细节控制'],
  ]) {
    for (const marker of [badge, positioning]) {
      if (!block.includes(marker)) errors.push(`${label} missing official positioning marker: ${marker}`)
    }
  }
  for (const marker of [
    'function isGptImage25Model(model)',
    'function isFlexibleGptImageSizeModel(model)',
    'const GPT_IMAGE_25_SIZE_BY_RESOLUTION = {',
    'flexibleGptImageSizeFor(',
    'if (quality) payload.quality = quality',
    "payload.output_format = format",
    "inputFidelity !== 'auto'",
    'payload.input_fidelity = inputFidelity',
    "background === 'transparent'",
    '透明背景仅支持 PNG 或 WebP 输出格式。',
  ]) {
    if (!classic.includes(marker)) errors.push(`GPT Image 2.5 parameter contract missing marker: ${marker}`)
  }
  if (classic.includes('if (!isGptImage25Model(imageModel) && quality)')) {
    errors.push('GPT Image 2.5 quality must not be suppressed')
  }
  if (!/if\s*\(\s*isGptImage2Model\(imageModel\)\s*&&\s*resolution/.test(classic)) {
    errors.push('classic must only send the selected resolution tier for GPT Image 2 routes')
  }
  if (/if\s*\(\s*isFlexibleGptImageSize\s*&&\s*resolution/.test(classic)) {
    errors.push('classic must not forward the UI-only resolution tier to GPT Image 2.5')
  }
  if (!classic.includes("'1:1': '1920x1920', '16:9': '2048x1152'")) {
    errors.push('classic GPT Image 2.5 2K square must use the verified 1920x1920 upstream size')
  }
  if (!classic.includes("'3:2': '3240x2160'") || !classic.includes("'2:3': '2160x3240'")) {
    errors.push('classic GPT Image 2.5 4K 3:2 and 2:3 edits must use accepted Image 2 sizes')
  }
  errors.push(
    ...markerErrors('GPT Image 2.5 upstream sanitization', openAIAdaptor, [
      'sanitizeGPTImage25Request(&request)',
      'isGPTImage25WorkshopOnlyField(key)',
      'case "resolution", "image_size", "aspect_ratio", "response_format"',
    ]),
    ...markerErrors('Image provider routing retry classification', taskController, [
      'isTransientPlaygroundImageProviderRoutingFailure(normalized)',
      '模型服务暂时不可用，请稍后重试。',
    ]),
  )
  if (classic.includes("supportsInputFidelity)\n        payload.input_fidelity")) {
    errors.push('classic must omit the UI-only auto input_fidelity value')
  }
  if (!gptImage2Block.includes('maxCount: 1')) {
    errors.push('gpt-image-2-4K must limit image generations to one')
  }

  if (!discountImage2Block) {
    errors.push('classic media playground must expose public model 特价 image-2')
  } else {
    for (const marker of [
      'sizes: OPENAI_IMAGE_ASPECT_RATIOS',
      'aspectRatios: OPENAI_IMAGE_ASPECT_RATIOS',
      'resolutions: DISCOUNT_IMAGE_2_RESOLUTIONS',
      "qualities: ['high']",
      "formats: ['png']",
      'maxCount: 1',
      'edit: false',
      '1K ¥0.06 / 2K ¥0.09 / 4K ¥0.13',
    ]) {
      if (!discountImage2Block.includes(marker)) {
        errors.push(`特价 image-2 missing verified contract marker: ${marker}`)
      }
    }
  }

  for (const marker of [
    'function imageModelSupportsWorkflow(modelConfig, workflow)',
    'imageModelSupportsWorkflow(item, imageWorkflow)',
    'if (mode === \'image\' && !imageModelSupportsWorkflow(activeImageModel, imageWorkflow))',
    '当前模型仅支持文生图，请切换到文生图或更换支持图片编辑的模型。',
  ]) {
    if (!classic.includes(marker)) {
      errors.push(`image workflow/model guard missing marker: ${marker}`)
    }
  }
  if (!discountImage2Block.includes('maxCount: 1')) {
    errors.push('特价 image-2 must limit image generations to one')
  }

  if (!stableImage2Block) {
    errors.push('classic media playground must expose public model 官转image 2稳定')
  } else {
    if (!stableImage2Block.includes('edit: true')) {
      errors.push('官转image 2稳定 must support image editing')
    }
    if (!stableImage2Block.includes('resolutions: GPT_IMAGE_2_RESOLUTIONS')) {
      errors.push('官转image 2稳定 must use GPT_IMAGE_2_RESOLUTIONS')
    }
    if (!stableImage2Block.includes("priceLabel: '¥0.17/张'")) {
      errors.push('官转image 2稳定 must show ¥0.17 fixed price')
    }
    if (!stableImage2Block.includes('1K / 2K / 4K 均固定 ¥0.17/张。')) {
      errors.push('官转image 2稳定 must state the fixed ¥0.17 price for 1K / 2K / 4K')
    }
    if (!stableImage2Block.includes('maxCount: 1')) {
      errors.push('官转image 2稳定 must limit image generations to one')
    }
  }

  if (gptImage2Block.includes('GOOGLE_GEMINI_31_FLASH_IMAGE_RESOLUTIONS')) {
    errors.push('gpt-image-2-4K must not expose Gemini 512 resolution choices')
  }

  if (classic.includes('geek2api-image-2')) {
    errors.push('classic media playground must not expose supplier model geek2api-image-2')
  }
  if (classic.includes('internal-image2-stable-v1')) {
    errors.push('classic media playground must not expose internal stable image model')
  }

  if (!banana2Block.includes('resolutions: GOOGLE_GEMINI_31_FLASH_IMAGE_RESOLUTIONS')) {
    errors.push('Banana 2 must expose the official Gemini 3.1 Flash 512 resolution tier')
  }

  if (grokBlock.includes("sizes: ['960x960'")) {
    errors.push('Grok UI must not expose legacy fixed pixel size table as primary control')
  }

  if (errors.length) return fail(errors)
  console.log('media playground image parameter check passed')
}

function fail(errors) {
  console.error('media playground image parameter check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

main().catch((error) => fail([error instanceof Error ? error.message : String(error)]))
