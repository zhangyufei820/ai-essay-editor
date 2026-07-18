#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

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

function main() {
  const sourceRoot = path.resolve(sourceRootFromArgs())
  const root = fs.existsSync(path.join(sourceRoot, 'web'))
    ? path.join(sourceRoot, 'web')
    : sourceRoot
  const classicPath = path.join(root, 'classic/src/pages/MediaPlayground/index.jsx')

  if (!fs.existsSync(classicPath)) {
    return fail([`missing required file: ${classicPath}`])
  }

  const classic = readText(classicPath)
  const gptImage2Block = modelBlock(classic, 'gpt-image-2-4K')
  const stableImage2Block = modelBlock(classic, '官转image 2稳定')
  const discountImage2Block = modelBlock(classic, '特价 image-2')
  const banana2Block = modelBlock(classic, 'banana-2')
  const geminiProBlock = modelBlock(classic, 'gemini-3-pro-image-preview')
  const grokBlock = modelBlock(classic, 'grok-imagine-image')
  const errors = []

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
      'sizes: XAI_GROK_IMAGE_ASPECT_RATIOS',
      "resolutions: ['1k']",
      "defaultResolution: '1k'",
      '当前供应商实际仅返回约 1K',
    ]),
  )

  if (!grokBlock.includes('edit: false') || !grokBlock.includes('仅支持文生图')) {
    errors.push('Grok Image Pro must remain text-to-image only')
  }

  if (grokBlock.includes("'2k'")) {
    errors.push('Grok Image Pro must not expose unverified 2k output')
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

  if (!gptImage2Block.includes('resolutions: GPT_IMAGE_2_RESOLUTIONS')) {
    errors.push('gpt-image-2-4K must use GPT_IMAGE_2_RESOLUTIONS')
  }

  if (!discountImage2Block) {
    errors.push('classic media playground must expose public model 特价 image-2')
  } else {
    if (!discountImage2Block.includes('resolutions: GPT_IMAGE_2_RESOLUTIONS')) {
      errors.push('特价 image-2 must use GPT_IMAGE_2_RESOLUTIONS')
    }
    if (!discountImage2Block.includes('1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10')) {
      errors.push('特价 image-2 must show original 1K/2K/4K tier prices')
    }
  }

  if (!stableImage2Block) {
    errors.push('classic media playground must expose public model 官转image 2稳定')
  } else {
    if (!stableImage2Block.includes('resolutions: GPT_IMAGE_2_RESOLUTIONS')) {
      errors.push('官转image 2稳定 must use GPT_IMAGE_2_RESOLUTIONS')
    }
    if (!stableImage2Block.includes("priceLabel: '¥0.135/张'")) {
      errors.push('官转image 2稳定 must show ¥0.135 fixed price')
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

main()
