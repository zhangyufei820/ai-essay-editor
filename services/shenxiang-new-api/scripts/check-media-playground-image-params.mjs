#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

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

  if (!fs.existsSync(classicPath)) {
    return fail([`missing required file: ${classicPath}`])
  }
  if (!fs.existsSync(imageAspectRatioPath)) {
    return fail([`missing required file: ${imageAspectRatioPath}`])
  }

  const classic = readText(classicPath)
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
  const errors = []

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
      'detectedRatio = await imageAspectRatioFromFile',
      '无法识别参考图比例，请重新上传图片后再试。',
    ]),
  )

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
      '1K ¥0.06 / 2K ¥0.09 / 4K ¥0.10',
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
    if (!discountImage2Block.includes('maxCount: 1')) {
      errors.push('特价 image-2 must limit image generations to one')
    }
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
    if (!stableImage2Block.includes("priceLabel: '¥0.135/张'")) {
      errors.push('官转image 2稳定 must show ¥0.135 fixed price')
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
